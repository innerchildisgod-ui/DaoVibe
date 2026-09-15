package org.daovibe.android.core.sync

import kotlinx.coroutines.CancellationException
import org.daovibe.android.core.connection.ConnectionHandshakeResult
import org.daovibe.android.core.connection.ConnectionJsonCodec
import org.daovibe.android.core.connection.ConnectionRepository
import org.daovibe.android.core.connection.ConnectionSession
import org.daovibe.android.core.connection.PeerTransport
import org.daovibe.android.core.connection.PeerTransportException
import org.daovibe.android.core.connection.toFailure
import org.daovibe.android.core.storage.DaoVibeDatabase

class SyncResponder(
    database: DaoVibeDatabase,
    nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L },
    localCapabilities: Set<org.daovibe.android.core.connection.ConnectionCapability> =
        org.daovibe.android.core.connection.DEFAULT_ANDROID_CONNECTION_CAPABILITIES,
    supportedConnectionVersions: Set<String> =
        org.daovibe.android.core.connection.SUPPORTED_CONNECTION_VERSIONS,
    supportedPacketProtocolVersions: Set<String> =
        org.daovibe.android.core.connection.SUPPORTED_PACKET_PROTOCOL_VERSIONS
) {
    private val connectionRepository = ConnectionRepository(
        database = database,
        nowSeconds = nowSeconds,
        localCapabilities = localCapabilities,
        supportedConnectionVersions = supportedConnectionVersions,
        supportedPacketProtocolVersions = supportedPacketProtocolVersions
    )
    private val packetSyncRepository = PacketSyncRepository(
        database = database,
        nowSeconds = nowSeconds
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

        while (true) {
            val message = SyncJsonCodec.decode(transport.receive())
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
                return SyncResponderResult.Completed(
                    session = session,
                    windowsProcessed = windowsProcessed
                )
            }
        }
    }
}
