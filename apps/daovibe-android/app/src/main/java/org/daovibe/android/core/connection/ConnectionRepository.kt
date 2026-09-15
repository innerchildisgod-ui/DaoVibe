package org.daovibe.android.core.connection

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import org.daovibe.android.core.identity.DeviceIdentityRepository
import org.daovibe.android.core.pairing.PairingRecord
import org.daovibe.android.core.pairing.PairingRepository
import org.daovibe.android.core.pairing.PairingRecordStatus
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.sync.DEFAULT_SYNC_BATCH_LIMIT
import org.daovibe.android.core.sync.MAX_SYNC_WINDOWS_PER_RUN
import org.daovibe.android.core.sync.PacketSyncRepository
import org.daovibe.android.core.sync.SyncBatch
import org.daovibe.android.core.sync.SyncImportException
import org.daovibe.android.core.sync.SyncJsonCodec
import org.daovibe.android.core.sync.SyncProtocol
import org.daovibe.android.core.sync.SyncProtocolException
import org.daovibe.android.core.sync.SyncReject
import org.daovibe.android.core.sync.SyncRunResult

sealed interface ConnectionHandshakeResult {
    val session: ConnectionSession

    data class Accepted(
        val message: ConnectionAccept,
        override val session: ConnectionSession
    ) : ConnectionHandshakeResult

    data class Rejected(
        val message: ConnectionReject,
        override val session: ConnectionSession
    ) : ConnectionHandshakeResult

    data class Failed(
        val failure: PeerTransportFailure,
        override val session: ConnectionSession
    ) : ConnectionHandshakeResult
}

class ConnectionRepository(
    private val database: DaoVibeDatabase,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L },
    private val sessionIdFactory: () -> String =
        { ConnectionProtocol.createSessionId() },
    private val localCapabilities: Set<ConnectionCapability> =
        DEFAULT_ANDROID_CONNECTION_CAPABILITIES,
    private val supportedConnectionVersions: Set<String> =
        SUPPORTED_CONNECTION_VERSIONS,
    private val supportedPacketProtocolVersions: Set<String> =
        SUPPORTED_PACKET_PROTOCOL_VERSIONS,
    private val peerTransportFactory: () -> PeerTransport =
        { TcpPeerTransport() }
) {
    private val identityRepository = DeviceIdentityRepository(
        database.daoVibeDao(),
        nowSeconds
    )
    private val pairingRepository = PairingRepository(database, nowSeconds)
    private val packetSyncRepository = PacketSyncRepository(database, nowSeconds)
    private val _sessions = MutableStateFlow<List<ConnectionSession>>(emptyList())
    private val attemptMutex = Mutex()

    val sessions: StateFlow<List<ConnectionSession>> =
        _sessions.asStateFlow()

    fun observeActivePairings(): Flow<List<PairingRecord>> =
        pairingRepository.observeActivePairings()

    suspend fun createHello(
        remoteNodeId: String,
        sourcePlatform: String = "android",
        sourceRole: String = "phone",
        sessionId: String = sessionIdFactory(),
        createdAt: Long = nowSeconds()
    ): ConnectionHello {
        val identity = identityRepository.getOrCreate()
        val pairing = pairingRepository.findPairingForRemote(
            localNodeId = identity.nodeId,
            remoteNodeId = remoteNodeId
        )

        if (pairing == null) {
            throw ConnectionProtocolException(
                ConnectionRejectReason.PAIRING_NOT_FOUND,
                "No local pairing record exists for $remoteNodeId"
            )
        }
        if (pairing.status != PairingRecordStatus.APPROVED) {
            throw ConnectionProtocolException(
                ConnectionRejectReason.PAIRING_INACTIVE,
                "The local pairing is not active"
            )
        }

        val hello = ConnectionProtocol.createHello(
            localNodeId = identity.nodeId,
            pairing = pairing,
            sourcePlatform = sourcePlatform,
            sourceRole = sourceRole,
            sessionId = sessionId,
            createdAt = createdAt,
            supportedConnectionVersions = supportedConnectionVersions,
            supportedPacketProtocolVersions = supportedPacketProtocolVersions,
            capabilities = localCapabilities
        )
        putSession(
            ConnectionSession(
                sessionId = hello.sessionId,
                localNodeId = identity.nodeId,
                remoteNodeId = hello.targetNodeId,
                pairingId = hello.pairingId,
                state = ConnectionSessionState.HELLO_SENT,
                localCapabilities = hello.capabilities
            )
        )
        return hello
    }

    suspend fun connectToPairedNode(
        remoteNodeId: String,
        endpoint: PeerEndpoint
    ): ConnectionHandshakeResult {
        val identity = identityRepository.getOrCreate()
        val pairing = pairingRepository.findPairingForRemote(
            localNodeId = identity.nodeId,
            remoteNodeId = remoteNodeId
        ) ?: throw ConnectionProtocolException(
            ConnectionRejectReason.PAIRING_NOT_FOUND,
            "No local pairing record exists for $remoteNodeId"
        )
        requireApprovedPairing(pairing, remoteNodeId)

        val sessionId = sessionIdFactory()
        val connectingSession = ConnectionSession(
            sessionId = sessionId,
            localNodeId = identity.nodeId,
            remoteNodeId = remoteNodeId,
            pairingId = pairing.pairingId,
            state = ConnectionSessionState.CONNECTING,
            localCapabilities = localCapabilities
        )
        putSession(connectingSession)

        if (!attemptMutex.tryLock()) {
            val failure = PeerTransportFailure(
                code = PeerTransportFailureCode.IO_FAILURE,
                message = "Another connection attempt is already running."
            )
            val failedSession = connectingSession.copy(
                state = ConnectionSessionState.FAILED,
                transportFailure = failure
            )
            putSession(failedSession)
            return ConnectionHandshakeResult.Failed(failure, failedSession)
        }

        var transport: PeerTransport? = null
        return try {
            val connectedTransport = peerTransportFactory().also {
                transport = it
            }
            connectedTransport.connect(endpoint)

            val hello = ConnectionProtocol.createHello(
                localNodeId = identity.nodeId,
                pairing = pairing,
                sourcePlatform = "android",
                sourceRole = "phone",
                sessionId = sessionId,
                createdAt = nowSeconds(),
                supportedConnectionVersions = supportedConnectionVersions,
                supportedPacketProtocolVersions = supportedPacketProtocolVersions,
                capabilities = localCapabilities
            )
            val helloJson = ConnectionJsonCodec.encode(hello)
            connectedTransport.send(helloJson)
            putSession(
                connectingSession.copy(
                    state = ConnectionSessionState.HELLO_SENT,
                    localCapabilities = hello.capabilities
                )
            )
            putSession(
                connectingSession.copy(
                    state = ConnectionSessionState.NEGOTIATING,
                    localCapabilities = hello.capabilities
                )
            )

            return when (val response = ConnectionJsonCodec.decode(
                connectedTransport.receive()
            )) {
                is ConnectionAccept ->
                    handleAccept(hello, response)
                is ConnectionReject ->
                    handleReject(hello, response)
                is ConnectionHello -> {
                    val failure = PeerTransportFailure(
                        code = PeerTransportFailureCode.INVALID_MESSAGE,
                        message = "Unexpected CONNECTION_HELLO response."
                    )
                    val failedSession = connectingSession.copy(
                        state = ConnectionSessionState.FAILED,
                        localCapabilities = hello.capabilities,
                        remoteCapabilities = response.capabilities,
                        transportFailure = failure
                    )
                    putSession(failedSession)
                    ConnectionHandshakeResult.Failed(failure, failedSession)
                }
            }
        } catch (error: PeerTransportException) {
            val failure = error.toFailure()
            val failedSession = connectingSession.copy(
                state = ConnectionSessionState.FAILED,
                transportFailure = failure
            )
            putSession(failedSession)
            ConnectionHandshakeResult.Failed(failure, failedSession)
        } catch (error: ConnectionProtocolException) {
            val failure = PeerTransportFailure(
                code = PeerTransportFailureCode.INVALID_MESSAGE,
                message = error.message ?: "Connection handshake validation failed."
            )
            val failedSession = connectingSession.copy(
                state = ConnectionSessionState.FAILED,
                rejectReason = error.reason,
                transportFailure = failure
            )
            putSession(failedSession)
            ConnectionHandshakeResult.Failed(failure, failedSession)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val factoryFailure = transport == null
            val failure = PeerTransportFailure(
                code = if (factoryFailure) {
                    PeerTransportFailureCode.IO_FAILURE
                } else {
                    PeerTransportFailureCode.INVALID_MESSAGE
                },
                message = if (factoryFailure) {
                    "Could not create the peer transport."
                } else {
                    "Connection response was malformed."
                }
            )
            val failedSession = connectingSession.copy(
                state = ConnectionSessionState.FAILED,
                transportFailure = failure
            )
            putSession(failedSession)
            ConnectionHandshakeResult.Failed(failure, failedSession)
        } finally {
            runCatching { transport?.close() }
            attemptMutex.unlock()
        }
    }

    suspend fun syncWithPairedNode(
        remoteNodeId: String,
        endpoint: PeerEndpoint,
        batchLimit: Int = DEFAULT_SYNC_BATCH_LIMIT
    ): SyncRunResult {
        val identity = identityRepository.getOrCreate()
        val pairing = pairingRepository.findPairingForRemote(
            localNodeId = identity.nodeId,
            remoteNodeId = remoteNodeId
        ) ?: throw ConnectionProtocolException(
            ConnectionRejectReason.PAIRING_NOT_FOUND,
            "No local pairing record exists for $remoteNodeId"
        )
        requireApprovedPairing(pairing, remoteNodeId)

        val sessionId = sessionIdFactory()
        val connectingSession = ConnectionSession(
            sessionId = sessionId,
            localNodeId = identity.nodeId,
            remoteNodeId = remoteNodeId,
            pairingId = pairing.pairingId,
            state = ConnectionSessionState.CONNECTING,
            localCapabilities = localCapabilities
        )
        putSession(connectingSession)

        if (!attemptMutex.tryLock()) {
            val failure = PeerTransportFailure(
                code = PeerTransportFailureCode.IO_FAILURE,
                message = "Another connection attempt is already running."
            )
            val failedSession = connectingSession.copy(
                state = ConnectionSessionState.FAILED,
                transportFailure = failure
            )
            putSession(failedSession)
            return SyncRunResult.Failed(failedSession, failure)
        }

        var transport: PeerTransport? = null
        var currentSession = connectingSession
        return try {
            val connectedTransport = peerTransportFactory().also {
                transport = it
            }
            connectedTransport.connect(endpoint)

            val hello = ConnectionProtocol.createHello(
                localNodeId = identity.nodeId,
                pairing = pairing,
                sourcePlatform = "android",
                sourceRole = "phone",
                sessionId = sessionId,
                createdAt = nowSeconds(),
                supportedConnectionVersions = supportedConnectionVersions,
                supportedPacketProtocolVersions = supportedPacketProtocolVersions,
                capabilities = localCapabilities
            )
            connectedTransport.send(ConnectionJsonCodec.encode(hello))
            putSession(
                currentSession.copy(
                    state = ConnectionSessionState.HELLO_SENT,
                    localCapabilities = hello.capabilities
                )
            )
            currentSession = currentSession.copy(
                state = ConnectionSessionState.NEGOTIATING,
                localCapabilities = hello.capabilities
            )
            putSession(currentSession)

            when (val response = ConnectionJsonCodec.decode(
                connectedTransport.receive()
            )) {
                is ConnectionAccept -> {
                    when (val handshake = handleAccept(hello, response)) {
                        is ConnectionHandshakeResult.Accepted -> {
                            currentSession = handshake.session
                            runSyncSession(
                                transport = connectedTransport,
                                session = currentSession,
                                remoteNodeId = remoteNodeId,
                                pairingId = pairing.pairingId,
                                batchLimit = batchLimit
                            )
                        }

                        is ConnectionHandshakeResult.Rejected ->
                            SyncRunResult.Rejected(
                                session = handshake.session,
                                reasonCode = handshake.message.reasonCode.wireValue,
                                message =
                                    "Remote connection rejected the sync: " +
                                        handshake.message.reasonCode.wireValue
                            )

                        is ConnectionHandshakeResult.Failed ->
                            SyncRunResult.Failed(
                                session = handshake.session,
                                failure = handshake.failure
                            )
                    }
                }

                is ConnectionReject -> {
                    when (val handshake = handleReject(hello, response)) {
                        is ConnectionHandshakeResult.Rejected ->
                            SyncRunResult.Rejected(
                                session = handshake.session,
                                reasonCode = response.reasonCode.wireValue,
                                message =
                                    "Remote connection rejected the sync: " +
                                        response.reasonCode.wireValue
                            )

                        is ConnectionHandshakeResult.Failed ->
                            SyncRunResult.Failed(
                                session = handshake.session,
                                failure = handshake.failure
                            )

                        is ConnectionHandshakeResult.Accepted ->
                            error("Connection reject produced an accepted result")
                    }
                }

                is ConnectionHello -> {
                    val failure = PeerTransportFailure(
                        code = PeerTransportFailureCode.INVALID_MESSAGE,
                        message = "Unexpected CONNECTION_HELLO response."
                    )
                    val failedSession = currentSession.copy(
                        state = ConnectionSessionState.FAILED,
                        remoteCapabilities = response.capabilities,
                        transportFailure = failure
                    )
                    putSession(failedSession)
                    SyncRunResult.Failed(failedSession, failure)
                }
            }
        } catch (error: PeerTransportException) {
            val failure = error.toFailure()
            val failedSession = currentSession.copy(
                state = ConnectionSessionState.FAILED,
                transportFailure = failure
            )
            putSession(failedSession)
            SyncRunResult.Failed(failedSession, failure)
        } catch (error: ConnectionProtocolException) {
            val failure = PeerTransportFailure(
                code = PeerTransportFailureCode.INVALID_MESSAGE,
                message = error.message ?: "Connection handshake validation failed."
            )
            val failedSession = currentSession.copy(
                state = ConnectionSessionState.FAILED,
                rejectReason = error.reason,
                transportFailure = failure
            )
            putSession(failedSession)
            SyncRunResult.Failed(failedSession, failure)
        } catch (
            error: SyncProtocolException
        ) {
            val failure = PeerTransportFailure(
                code = PeerTransportFailureCode.INVALID_MESSAGE,
                message = error.message ?: "Sync protocol validation failed."
            )
            val failedSession = currentSession.copy(
                state = ConnectionSessionState.FAILED,
                transportFailure = failure
            )
            putSession(failedSession)
            SyncRunResult.Failed(failedSession, failure)
        } catch (error: SyncImportException) {
            val failure = PeerTransportFailure(
                code = PeerTransportFailureCode.INVALID_MESSAGE,
                message = error.message ?: "Sync batch import failed."
            )
            val failedSession = currentSession.copy(
                state = ConnectionSessionState.FAILED,
                transportFailure = failure
            )
            putSession(failedSession)
            SyncRunResult.Failed(failedSession, failure)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val factoryFailure = transport == null
            val failure = PeerTransportFailure(
                code = if (factoryFailure) {
                    PeerTransportFailureCode.IO_FAILURE
                } else {
                    PeerTransportFailureCode.INVALID_MESSAGE
                },
                message = if (factoryFailure) {
                    "Could not create the peer transport."
                } else {
                    error.message ?: "Sync response was malformed."
                }
            )
            val failedSession = currentSession.copy(
                state = ConnectionSessionState.FAILED,
                transportFailure = failure
            )
            putSession(failedSession)
            SyncRunResult.Failed(failedSession, failure)
        } finally {
            runCatching { transport?.close() }
            attemptMutex.unlock()
        }
    }

    private suspend fun runSyncSession(
        transport: PeerTransport,
        session: ConnectionSession,
        remoteNodeId: String,
        pairingId: String,
        batchLimit: Int
    ): SyncRunResult {
        var cursor = packetSyncRepository.loadInboundCursor(
            remoteNodeId = remoteNodeId,
            pairingId = pairingId
        )
        var importedPackets = 0
        var duplicatePackets = 0
        var windowsProcessed = 0

        while (true) {
            if (windowsProcessed >= MAX_SYNC_WINDOWS_PER_RUN) {
                throw SyncProtocolException(
                    reason =
                        org.daovibe.android.core.sync.SyncRejectReason
                            .MAX_WINDOWS_EXCEEDED,
                    message =
                        "Sync stopped after " +
                            "$MAX_SYNC_WINDOWS_PER_RUN windows"
                )
            }

            val request = SyncProtocol.createRequest(
                session = session,
                cursor = cursor,
                limit = batchLimit
            )
            transport.send(SyncJsonCodec.encode(request))

            when (val syncResponse = SyncJsonCodec.decode(transport.receive())) {
                is SyncBatch -> {
                    SyncProtocol.validateBatchForClient(
                        batch = syncResponse,
                        session = session
                    )
                    if (syncResponse.requestCursor != cursor) {
                        throw SyncImportException(
                            reason =
                                org.daovibe.android.core.sync.SyncRejectReason
                                    .CURSOR_MISMATCH,
                            message =
                                "Sync batch cursor does not match the " +
                                    "requested cursor"
                        )
                    }

                    val importResult = packetSyncRepository.importBatch(
                        batch = syncResponse,
                        remoteNodeId = remoteNodeId,
                        pairingId = pairingId,
                        importedAt = nowSeconds()
                    )
                    importedPackets += importResult.insertedPackets
                    duplicatePackets += importResult.duplicatePackets
                    windowsProcessed += 1

                    if (!syncResponse.hasMore) {
                        return SyncRunResult.Completed(
                            session = session,
                            importedPackets = importedPackets,
                            duplicatePackets = duplicatePackets,
                            windowsProcessed = windowsProcessed,
                            latestCursor = importResult.cursorAfter
                        )
                    }
                    if (syncResponse.nextCursor == cursor) {
                        throw SyncProtocolException(
                            reason =
                                org.daovibe.android.core.sync.SyncRejectReason
                                    .CURSOR_STALLED,
                            message = "Sync responder returned a stalled cursor"
                        )
                    }
                    cursor = syncResponse.nextCursor
                }

                is SyncReject -> {
                    SyncProtocol.validateRejectForClient(
                        reject = syncResponse,
                        session = session
                    )
                    return SyncRunResult.Rejected(
                        session = session,
                        reasonCode = syncResponse.reasonCode.wireValue,
                        message =
                            "Remote sync rejected the request: " +
                                syncResponse.reasonCode.wireValue
                    )
                }

                is org.daovibe.android.core.sync.SyncRequest ->
                    throw SyncProtocolException(
                        reason =
                            org.daovibe.android.core.sync.SyncRejectReason
                                .INVALID_MESSAGE,
                        message = "Unexpected SYNC_REQUEST response"
                    )
            }
        }
    }

    suspend fun handleHello(
        hello: ConnectionHello,
        acceptedAt: Long = nowSeconds()
    ): ConnectionHandshakeResult {
        val identity = identityRepository.getOrCreate()

        return try {
            val pairing = pairingRepository.getPairingRecord(hello.pairingId)
            val accept = ConnectionProtocol.createAccept(
                hello = hello,
                localNodeId = identity.nodeId,
                pairing = pairing,
                acceptedAt = acceptedAt,
                localSupportedConnectionVersions =
                    supportedConnectionVersions,
                localSupportedPacketProtocolVersions =
                    supportedPacketProtocolVersions,
                localCapabilities = localCapabilities
            )
            putSession(
                ConnectionSession(
                    sessionId = hello.sessionId,
                    localNodeId = identity.nodeId,
                    remoteNodeId = hello.sourceNodeId,
                    pairingId = hello.pairingId,
                    state = ConnectionSessionState.HELLO_RECEIVED,
                    localCapabilities = localCapabilities,
                    remoteCapabilities = hello.capabilities
                )
            )
            val session = ConnectionSession(
                sessionId = hello.sessionId,
                localNodeId = identity.nodeId,
                remoteNodeId = hello.sourceNodeId,
                pairingId = hello.pairingId,
                state = ConnectionSessionState.CONNECTED,
                negotiatedConnectionVersion =
                    accept.negotiatedConnectionVersion,
                negotiatedPacketProtocolVersion =
                    accept.negotiatedPacketProtocolVersion,
                localCapabilities = localCapabilities,
                remoteCapabilities = hello.capabilities,
                negotiatedCapabilities = accept.capabilities
            )
            putSession(session)
            ConnectionHandshakeResult.Accepted(accept, session)
        } catch (error: ConnectionProtocolException) {
            rejectOrFailHello(
                identityNodeId = identity.nodeId,
                hello = hello,
                acceptedAt = acceptedAt,
                reason = error.reason,
                failureMessage = error.message
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            rejectOrFailHello(
                identityNodeId = identity.nodeId,
                hello = hello,
                acceptedAt = acceptedAt,
                reason = ConnectionRejectReason.INVALID_MESSAGE,
                failureMessage = error.message
            )
        }
    }

    suspend fun handleAccept(
        hello: ConnectionHello,
        accept: ConnectionAccept,
        receivedAt: Long = nowSeconds()
    ): ConnectionHandshakeResult {
        val identity = identityRepository.getOrCreate()
        val pairing = pairingRepository.getPairingRecord(hello.pairingId)

        return try {
            ConnectionProtocol.validateAcceptForHello(
                hello = hello,
                accept = accept,
                localNodeId = identity.nodeId,
                pairing = pairing,
                localSupportedConnectionVersions =
                    supportedConnectionVersions,
                localSupportedPacketProtocolVersions =
                    supportedPacketProtocolVersions,
                localCapabilities = localCapabilities
            )
            val session = ConnectionSession(
                sessionId = hello.sessionId,
                localNodeId = identity.nodeId,
                remoteNodeId = hello.targetNodeId,
                pairingId = hello.pairingId,
                state = ConnectionSessionState.CONNECTED,
                negotiatedConnectionVersion =
                    accept.negotiatedConnectionVersion,
                negotiatedPacketProtocolVersion =
                    accept.negotiatedPacketProtocolVersion,
                localCapabilities = localCapabilities,
                remoteCapabilities = accept.capabilities,
                negotiatedCapabilities = accept.capabilities
            )
            putSession(session)
            ConnectionHandshakeResult.Accepted(accept, session)
        } catch (error: ConnectionProtocolException) {
            val failure = PeerTransportFailure(
                code = PeerTransportFailureCode.INVALID_MESSAGE,
                message = error.message ?: "Connection accept failed validation."
            )
            val session = ConnectionSession(
                sessionId = hello.sessionId,
                localNodeId = identity.nodeId,
                remoteNodeId = pairing?.remoteNodeId ?: hello.targetNodeId,
                pairingId = hello.pairingId,
                state = ConnectionSessionState.FAILED,
                localCapabilities = localCapabilities,
                remoteCapabilities = accept.capabilities,
                rejectReason = error.reason,
                transportFailure = failure
            )
            putSession(session)
            ConnectionHandshakeResult.Failed(failure, session)
        }
    }

    suspend fun handleReject(
        hello: ConnectionHello,
        reject: ConnectionReject,
        receivedAt: Long = nowSeconds()
    ): ConnectionHandshakeResult {
        val identity = identityRepository.getOrCreate()
        val pairing = pairingRepository.getPairingRecord(hello.pairingId)

        return try {
            ConnectionProtocol.validateRejectForHello(
                hello = hello,
                rejectMessage = reject,
                localNodeId = identity.nodeId,
                pairing = pairing
            )
            val session = ConnectionSession(
                sessionId = hello.sessionId,
                localNodeId = identity.nodeId,
                remoteNodeId = hello.targetNodeId,
                pairingId = hello.pairingId,
                state = ConnectionSessionState.REJECTED,
                localCapabilities = localCapabilities,
                rejectReason = reject.reasonCode
            )
            putSession(session)
            ConnectionHandshakeResult.Rejected(reject, session)
        } catch (error: ConnectionProtocolException) {
            val failure = PeerTransportFailure(
                code = PeerTransportFailureCode.INVALID_MESSAGE,
                message = error.message ?: "Connection reject failed validation."
            )
            val session = ConnectionSession(
                sessionId = hello.sessionId,
                localNodeId = identity.nodeId,
                remoteNodeId = pairing?.remoteNodeId ?: hello.targetNodeId,
                pairingId = hello.pairingId,
                state = ConnectionSessionState.FAILED,
                localCapabilities = localCapabilities,
                rejectReason = error.reason,
                transportFailure = failure
            )
            putSession(session)
            ConnectionHandshakeResult.Failed(failure, session)
        }
    }

    suspend fun disconnect(sessionId: String) {
        val existing = _sessions.value.firstOrNull { it.sessionId == sessionId }
            ?: return
        putSession(existing.copy(state = ConnectionSessionState.DISCONNECTED))
    }

    fun fail(sessionId: String, reason: ConnectionRejectReason? = null) {
        val existing = _sessions.value.firstOrNull { it.sessionId == sessionId }
            ?: return
        putSession(
            existing.copy(
                state = ConnectionSessionState.FAILED,
                rejectReason = reason
            )
        )
    }

    private fun rejectOrFailHello(
        identityNodeId: String,
        hello: ConnectionHello,
        acceptedAt: Long,
        reason: ConnectionRejectReason,
        failureMessage: String?
    ): ConnectionHandshakeResult {
        val reject = runCatching {
            ConnectionProtocol.createReject(
                sessionId = hello.sessionId,
                sourceNodeId = identityNodeId,
                targetNodeId = hello.sourceNodeId,
                pairingId = hello.pairingId,
                rejectedAt = acceptedAt,
                reason = reason
            )
        }.getOrNull()

        if (reject != null) {
            val session = ConnectionSession(
                sessionId = hello.sessionId,
                localNodeId = identityNodeId,
                remoteNodeId = hello.sourceNodeId,
                pairingId = hello.pairingId,
                state = ConnectionSessionState.REJECTED,
                localCapabilities = localCapabilities,
                remoteCapabilities = hello.capabilities,
                rejectReason = reason
            )
            putSession(session)
            return ConnectionHandshakeResult.Rejected(reject, session)
        }

        val failure = PeerTransportFailure(
            code = PeerTransportFailureCode.INVALID_MESSAGE,
            message = failureMessage ?: "Incoming connection hello was malformed."
        )
        val session = ConnectionSession(
            sessionId = hello.sessionId,
            localNodeId = identityNodeId,
            remoteNodeId = hello.sourceNodeId,
            pairingId = hello.pairingId,
            state = ConnectionSessionState.FAILED,
            localCapabilities = localCapabilities,
            remoteCapabilities = hello.capabilities,
            rejectReason = reason,
            transportFailure = failure
        )
        putSession(session)
        return ConnectionHandshakeResult.Failed(failure, session)
    }

    private fun requireApprovedPairing(
        pairing: PairingRecord?,
        remoteNodeId: String
    ) {
        if (pairing == null) {
            throw ConnectionProtocolException(
                ConnectionRejectReason.PAIRING_NOT_FOUND,
                "No local pairing record exists for $remoteNodeId"
            )
        }
        if (pairing.status != PairingRecordStatus.APPROVED) {
            throw ConnectionProtocolException(
                ConnectionRejectReason.PAIRING_INACTIVE,
                "The local pairing is not active"
            )
        }
    }

    private fun putSession(session: ConnectionSession) {
        _sessions.value = _sessions.value
            .filterNot { it.sessionId == session.sessionId }
            .plus(session)
            .sortedBy { it.sessionId }
    }
}
