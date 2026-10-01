package org.daovibe.android.core.sync

import kotlinx.coroutines.CancellationException
import org.daovibe.android.core.connection.ConnectionHandshakeResult
import org.daovibe.android.core.connection.ConnectionJsonCodec
import org.daovibe.android.core.connection.ConnectionRepository
import org.daovibe.android.core.connection.ConnectionSession
import org.daovibe.android.core.connection.PeerTransport
import org.daovibe.android.core.connection.PeerTransportException
import org.daovibe.android.core.connection.toFailure
import org.daovibe.android.core.identity.IdentitySecretStorage
import org.daovibe.android.core.identity.UnavailableIdentitySecretStorage
import org.daovibe.android.core.storage.DaoVibeDatabase

class SyncResponder(
    database: DaoVibeDatabase,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L },
    localCapabilities: Set<org.daovibe.android.core.connection.ConnectionCapability> =
        org.daovibe.android.core.connection.DEFAULT_ANDROID_CONNECTION_CAPABILITIES,
    supportedConnectionVersions: Set<String> =
        org.daovibe.android.core.connection.SUPPORTED_CONNECTION_VERSIONS,
    supportedPacketProtocolVersions: Set<String> =
        org.daovibe.android.core.connection.SUPPORTED_PACKET_PROTOCOL_VERSIONS,
    secretStorage: IdentitySecretStorage = UnavailableIdentitySecretStorage()
) {
    private val connectionRepository = ConnectionRepository(
        database = database,
        nowSeconds = nowSeconds,
        localCapabilities = localCapabilities,
        supportedConnectionVersions = supportedConnectionVersions,
        supportedPacketProtocolVersions = supportedPacketProtocolVersions,
        secretStorage = secretStorage
    )
    private val packetSyncRepository = PacketSyncRepository(
        database = database,
        nowSeconds = nowSeconds,
        secretStorage = secretStorage
    )

    suspend fun serveOnce(transport: PeerTransport): SyncResponderResult {
        var currentSession: ConnectionSession? = null

        return try {
            val hello = ConnectionJsonCodec.decodeHello(transport.receive())
            when (
                val handshake = connectionRepository.handleHello(
                    hello = hello
                )
            ) {
                is ConnectionHandshakeResult.Accepted -> {
                    currentSession = handshake.session
                    transport.send(ConnectionJsonCodec.encode(handshake.message))
                }

                is ConnectionHandshakeResult.Rejected -> {
                    transport.send(ConnectionJsonCodec.encode(handshake.message))
                    return SyncResponderResult.Rejected(
                        session = handshake.session,
                        reasonCode = handshake.message.reasonCode.wireValue,
                        message =
                            "Connection rejected: " +
                                handshake.message.reasonCode.wireValue
                    )
                }

                is ConnectionHandshakeResult.Failed ->
                    return SyncResponderResult.Failed(
                        session = handshake.session,
                        failure = handshake.failure
                    )
            }

            val session = currentSession
                ?: error("Accepted handshake did not provide a session")
            serveSyncSession(transport, session)
        } catch (error: PeerTransportException) {
            SyncResponderResult.Failed(
                session = currentSession,
                failure = error.toFailure()
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            SyncResponderResult.Failed(
                session = currentSession,
                failure =
                    org.daovibe.android.core.connection.PeerTransportFailure(
                        code =
                            org.daovibe.android.core.connection
                                .PeerTransportFailureCode.INVALID_MESSAGE,
                        message = error.message ?: "Sync responder failed"
                    )
            )
        } finally {
            runCatching { transport.close() }
        }
    }

    private suspend fun serveSyncSession(
        transport: PeerTransport,
        session: ConnectionSession
    ): SyncResponderResult {
        var windowsProcessed = 0
        var firstFrame = true

        while (true) {
            val message = try {
                SyncJsonCodec.decode(transport.receive())
            } catch (error: PeerTransportException) {
                if (firstFrame && error.code == org.daovibe.android.core.connection.PeerTransportFailureCode.CONNECTION_CLOSED) {
                    return SyncResponderResult.Completed(session, windowsProcessed = 0)
                }
                throw error
            }
            firstFrame = false
            if (message !is SyncRequest) {
                return SyncResponderResult.Failed(
                    session = session,
                    failure =
                        org.daovibe.android.core.connection.PeerTransportFailure(
                            code =
                                org.daovibe.android.core.connection
                                    .PeerTransportFailureCode.INVALID_MESSAGE,
                            message = "Expected SYNC_REQUEST after handshake"
                        )
                )
            }

            try {
                SyncProtocol.validateRequestForResponder(
                    request = message,
                    session = session
                )
            } catch (error: SyncProtocolException) {
                val reject = SyncProtocol.createRejectForRequest(
                    request = message,
                    reason = error.reason
                )
                transport.send(SyncJsonCodec.encode(reject))
                return SyncResponderResult.Rejected(
                    session = session,
                    reasonCode = reject.reasonCode.wireValue,
                    message = error.message ?: "Sync request rejected"
                )
            }

            if (windowsProcessed >= MAX_SYNC_WINDOWS_PER_RUN) {
                val reject = SyncProtocol.createRejectForRequest(
                    request = message,
                    reason = SyncRejectReason.MAX_WINDOWS_EXCEEDED
                )
                transport.send(SyncJsonCodec.encode(reject))
                return SyncResponderResult.Rejected(
                    session = session,
                    reasonCode = reject.reasonCode.wireValue,
                    message =
                        "Sync responder stopped after " +
                            "$MAX_SYNC_WINDOWS_PER_RUN windows"
                )
            }

            val batch = try {
                packetSyncRepository.exportWindow(message)
            } catch (error: SyncProtocolException) {
                val reject = SyncProtocol.createRejectForRequest(
                    request = message,
                    reason = error.reason
                )
                transport.send(SyncJsonCodec.encode(reject))
                return SyncResponderResult.Rejected(
                    session = session,
                    reasonCode = reject.reasonCode.wireValue,
                    message = error.message ?: "Sync export failed"
                )
            }
            transport.send(SyncJsonCodec.encode(batch))
            windowsProcessed += 1

            if (!batch.hasMore) {
                pullFromRemote(transport, session)
                return SyncResponderResult.Completed(
                    session = session,
                    windowsProcessed = windowsProcessed
                )
            }
        }
    }

    /** Pull the initiator's ledger after serving our export. The packets are
     * imported through the normal ledger path, so a later peer can export
     * them unchanged (including original author and packet ID). */
    private suspend fun pullFromRemote(
        transport: PeerTransport,
        session: ConnectionSession
    ) {
        var cursor = packetSyncRepository.loadInboundCursor(
            remoteNodeId = session.remoteNodeId,
            pairingId = session.pairingId
        )
        var windows = 0
        while (true) {
            if (windows >= MAX_SYNC_WINDOWS_PER_RUN) {
                throw SyncProtocolException(
                    reason = SyncRejectReason.MAX_WINDOWS_EXCEEDED,
                    message = "Reverse sync exceeded $MAX_SYNC_WINDOWS_PER_RUN windows"
                )
            }
            val request = SyncProtocol.createRequest(
                session = session,
                cursor = cursor,
                limit = DEFAULT_SYNC_BATCH_LIMIT
            )
            transport.send(SyncJsonCodec.encode(request))
            when (val response = SyncJsonCodec.decode(transport.receive())) {
                is SyncBatch -> {
                    SyncProtocol.validateBatchForClient(response, session)
                    if (response.requestCursor != cursor) {
                        throw SyncProtocolException(
                            reason = SyncRejectReason.CURSOR_MISMATCH,
                            message = "Reverse sync cursor mismatch"
                        )
                    }
                    packetSyncRepository.importBatch(
                        batch = response,
                        remoteNodeId = session.remoteNodeId,
                        pairingId = session.pairingId,
                        importedAt = nowSeconds()
                    )
                    windows += 1
                    if (!response.hasMore) return
                    if (response.nextCursor == cursor) {
                        throw SyncProtocolException(
                            reason = SyncRejectReason.CURSOR_STALLED,
                            message = "Reverse sync responder returned a stalled cursor"
                        )
                    }
                    cursor = response.nextCursor
                }
                is SyncReject -> throw SyncProtocolException(
                    reason = SyncRejectReason.INVALID_MESSAGE,
                    message = "Remote reverse sync rejected: ${response.reasonCode.wireValue}"
                )
                is SyncRequest -> throw SyncProtocolException(
                    reason = SyncRejectReason.INVALID_MESSAGE,
                    message = "Expected reverse SYNC_BATCH response"
                )
            }
        }
    }
}
