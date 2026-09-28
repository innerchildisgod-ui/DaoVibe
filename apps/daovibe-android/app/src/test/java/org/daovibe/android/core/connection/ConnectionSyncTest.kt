package org.daovibe.android.core.connection

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.daovibe.android.core.identity.DeviceIdentityRepository
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.pairing.PairingRecord
import org.daovibe.android.core.pairing.PairingRecordStatus
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.DeviceIdentityEntity
import org.daovibe.android.core.storage.PairingRecordEntity
import org.daovibe.android.core.sync.MAX_SYNC_WINDOWS_PER_RUN
import org.daovibe.android.core.sync.SyncBatch
import org.daovibe.android.core.sync.SyncJsonCodec
import org.daovibe.android.core.sync.SyncProtocol
import org.daovibe.android.core.sync.SyncResponder
import org.daovibe.android.core.sync.SyncResponderResult
import org.daovibe.android.core.sync.SyncRunResult
import org.daovibe.android.core.sync.toCanonicalJson
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.atomic.AtomicInteger

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ConnectionSyncTest {
    private lateinit var clientDatabase: DaoVibeDatabase
    private lateinit var serverDatabase: DaoVibeDatabase

    @Before
    fun setUp() {
        clientDatabase = newDatabase()
        serverDatabase = newDatabase()
    }

    @After
    fun tearDown() {
        clientDatabase.close()
        serverDatabase.close()
    }

    @Test
    fun loopbackTcpHandshakeAndSyncWindowConverges() = runTest {
        val clientPairing = installClientPairing()
        installServerPairing(clientPairing.localNodeId)
        val clientIdentity = DeviceIdentityRepository(
            clientDatabase.daoVibeDao(),
            nowSeconds = { NOW }
        ).getOrCreate()
        val serverRepository = LocalMyceliumRepository(
            database = serverDatabase,
            nowSeconds = { NOW }
        )
        val packetResult = serverRepository.observePhrase("Loopback sync phrase")
        val listener = TcpPeerListener(
            bindHost = "127.0.0.1",
            acceptTimeoutMillis = 2_000,
            readTimeoutMillis = 2_000
        )
        val endpoint = listener.start(0)
        val serverJob = async(Dispatchers.IO) {
            val transport = listener.accept()
            serveLoopbackBidirectionalSync(
                transport = transport,
                clientNodeId = clientPairing.localNodeId
            )
        }
        val clientRepository = ConnectionRepository(
            database = clientDatabase,
            nowSeconds = { NOW },
            sessionIdFactory = { SESSION_ID }
        )

        try {
            val clientResult = clientRepository.syncWithPairedNode(
                remoteNodeId = SERVER_NODE,
                endpoint = endpoint
            )
            val serverResult = serverJob.await()

            assertTrue(clientResult is SyncRunResult.Completed)
            assertEquals(1, (clientResult as SyncRunResult.Completed).importedPackets)
            assertEquals(1, (clientResult as SyncRunResult.Completed).windowsProcessed)
            assertTrue(serverResult is SyncResponderResult.Completed)
            assertEquals(
                1,
                serverDatabase.daoVibeDao().listPacketsInLedgerOrder().size
            )
            assertEquals(
                packetResult.packetId,
                clientDatabase.daoVibeDao()
                    .listPacketsInLedgerOrder()
                    .single()
                    .packetId
            )
            assertEquals(
                SERVER_NODE,
                clientDatabase.daoVibeDao()
                    .listPacketsInLedgerOrder()
                    .single()
                    .author
            )
            assertEquals(
                clientIdentity.nodeId,
                DeviceIdentityRepository(
                    clientDatabase.daoVibeDao(),
                    nowSeconds = { NOW }
                ).getOrCreate().nodeId
            )
        } finally {
            listener.stop()
        }
    }

    @Test
    fun loopbackTcpSyncConvergesAcrossMoreThanFiftyPackets() = runTest {
        val clientPairing = installClientPairing()
        installServerPairing(clientPairing.localNodeId)
        val serverRepository = LocalMyceliumRepository(
            database = serverDatabase,
            nowSeconds = { NOW }
        )
        repeat(55) { index ->
            serverRepository.observePhrase("Multi-window phrase $index")
        }

        val listener = TcpPeerListener(
            bindHost = "127.0.0.1",
            acceptTimeoutMillis = 2_000,
            readTimeoutMillis = 2_000
        )
        val endpoint = listener.start(0)
        val serverJob = async(Dispatchers.IO) {
            val transport = listener.accept()
            serveLoopbackBidirectionalSync(
                transport = transport,
                clientNodeId = clientPairing.localNodeId
            )
        }
        val clientRepository = ConnectionRepository(
            database = clientDatabase,
            nowSeconds = { NOW },
            sessionIdFactory = { SESSION_ID }
        )

        try {
            val clientResult = clientRepository.syncWithPairedNode(
                remoteNodeId = SERVER_NODE,
                endpoint = endpoint,
                batchLimit = 10
            )
            val serverResult = serverJob.await()

            assertTrue(clientResult is SyncRunResult.Completed)
            val completed = clientResult as SyncRunResult.Completed
            assertEquals(55, completed.importedPackets)
            assertEquals(6, completed.windowsProcessed)
            assertTrue(serverResult is SyncResponderResult.Completed)
            assertEquals(
                serverDatabase.daoVibeDao().listPacketsInLedgerOrder().map {
                    it.packetId
                },
                clientDatabase.daoVibeDao().listPacketsInLedgerOrder().map {
                    it.packetId
                }
            )
        } finally {
            listener.stop()
        }
    }

    @Test
    fun syncStopsAtMaximumWindowGuardAndClosesTransport() = runTest {
        val clientPairing = installClientPairing()
        val requestCount = AtomicInteger(0)
        lateinit var transport: SyncScriptedPeerTransport
        transport = SyncScriptedPeerTransport { messages ->
            if (messages.size == 1) {
                acceptForHello(messages.single())
            } else {
                val request = SyncJsonCodec.decodeRequest(messages.last())
                val index = requestCount.getAndIncrement()
                val packet = phrasePacket(index)
                SyncBatch(
                    protocolVersion = org.daovibe.android.core.sync.SYNC_PROTOCOL_VERSION,
                    sessionId = request.sessionId,
                    sourceNodeId = SERVER_NODE,
                    targetNodeId = clientPairing.localNodeId,
                    pairingId = request.pairingId,
                    requestCursor = request.cursor,
                    nextCursor = SyncProtocol.cursorFor(
                        receivedAt = index.toLong() + 1L,
                        packetId = "cursor_$index"
                    ),
                    hasMore = true,
                    packets = listOf(packet)
                ).toCanonicalJson()
            }
        }
        val repository = newClientConnectionRepository(transport)

        val result = repository.syncWithPairedNode(
            remoteNodeId = SERVER_NODE,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(result is SyncRunResult.Failed)
        assertTrue(
            (result as SyncRunResult.Failed).failure.message.contains(
                "$MAX_SYNC_WINDOWS_PER_RUN"
            )
        )
        assertEquals(MAX_SYNC_WINDOWS_PER_RUN, requestCount.get())
        assertTrue(transport.closed)
        assertEquals(
            MAX_SYNC_WINDOWS_PER_RUN,
            clientDatabase.daoVibeDao().listPacketsInLedgerOrder().size
        )
    }

    @Test
    fun stalledNextCursorIsDetectedWithoutAdvancingCursor() = runTest {
        val clientPairing = installClientPairing()
        lateinit var transport: SyncScriptedPeerTransport
        transport = SyncScriptedPeerTransport { messages ->
            if (messages.size == 1) {
                acceptForHello(messages.single())
            } else {
                val request = SyncJsonCodec.decodeRequest(messages.last())
                SyncBatch(
                    protocolVersion = org.daovibe.android.core.sync.SYNC_PROTOCOL_VERSION,
                    sessionId = request.sessionId,
                    sourceNodeId = SERVER_NODE,
                    targetNodeId = clientPairing.localNodeId,
                    pairingId = request.pairingId,
                    requestCursor = request.cursor,
                    nextCursor = request.cursor,
                    hasMore = true,
                    packets = emptyList()
                ).toCanonicalJson()
            }
        }
        val repository = newClientConnectionRepository(transport)

        val result = repository.syncWithPairedNode(
            remoteNodeId = SERVER_NODE,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(result is SyncRunResult.Failed)
        assertTrue(
            (result as SyncRunResult.Failed).failure.message
                .contains("next_cursor did not advance")
        )
        assertEquals(0, clientDatabase.daoVibeDao().listPacketsInLedgerOrder().size)
        assertEquals(null, clientDatabase.daoVibeDao().getPeerSyncState(SERVER_NODE))
        assertTrue(transport.closed)
    }

    @Test
    fun wrongSessionAndNodeDirectionAreRejectedBeforeImport() = runTest {
        val clientPairing = installClientPairing()
        listOf("session", "direction").forEach { mismatch ->
            lateinit var transport: SyncScriptedPeerTransport
            transport = SyncScriptedPeerTransport { messages ->
                if (messages.size == 1) {
                    acceptForHello(messages.single())
                } else {
                    val request = SyncJsonCodec.decodeRequest(messages.last())
                    val batch = SyncBatch(
                        protocolVersion =
                            org.daovibe.android.core.sync.SYNC_PROTOCOL_VERSION,
                        sessionId = if (mismatch == "session") {
                            "session_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        } else {
                            request.sessionId
                        },
                        sourceNodeId = if (mismatch == "direction") {
                            clientPairing.localNodeId
                        } else {
                            SERVER_NODE
                        },
                        targetNodeId = if (mismatch == "direction") {
                            SERVER_NODE
                        } else {
                            clientPairing.localNodeId
                        },
                        pairingId = request.pairingId,
                        requestCursor = request.cursor,
                        nextCursor = request.cursor,
                        hasMore = false,
                        packets = emptyList()
                    )
                    SyncJsonCodec.encode(batch)
                }
            }
            val repository = newClientConnectionRepository(transport)

            val result = repository.syncWithPairedNode(
                remoteNodeId = SERVER_NODE,
                endpoint = PeerEndpoint("127.0.0.1", 4242)
            )

            assertTrue("$mismatch must fail", result is SyncRunResult.Failed)
            assertTrue(transport.closed)
        }
        assertEquals(0, clientDatabase.daoVibeDao().listPacketsInLedgerOrder().size)
    }

    @Test
    fun inactivePairingCannotStartSync() = runTest {
        val identity = DeviceIdentityRepository(
            clientDatabase.daoVibeDao(),
            nowSeconds = { NOW }
        ).getOrCreate()
        clientDatabase.daoVibeDao().upsertPairingRecord(
            pairingEntity(
                pairingId = PAIRING_ID,
                localNodeId = identity.nodeId,
                remoteNodeId = SERVER_NODE,
                status = "rejected"
            )
        )
        var factoryCalls = 0
        val repository = ConnectionRepository(
            database = clientDatabase,
            nowSeconds = { NOW },
            peerTransportFactory = {
                factoryCalls += 1
                error("transport must not be created")
            }
        )

        val error = runCatching {
            repository.syncWithPairedNode(
                remoteNodeId = SERVER_NODE,
                endpoint = PeerEndpoint("127.0.0.1", 4242)
            )
        }.exceptionOrNull()

        assertTrue(error is ConnectionProtocolException)
        assertEquals(
            ConnectionRejectReason.PAIRING_INACTIVE,
            (error as ConnectionProtocolException).reason
        )
        assertEquals(0, factoryCalls)
    }

    @Test
    fun syncTransportFactoryFailureIsIoFailureAndGuardCanBeReused() = runTest {
        val clientPairing = installClientPairing()
        val identityBefore = clientPairing.localNodeId
        val pairingsBefore = clientDatabase.daoVibeDao().listPairingRecords()
        var factoryCalls = 0
        lateinit var successfulTransport: SyncScriptedPeerTransport
        var reverseRequestQueued = false

        successfulTransport = SyncScriptedPeerTransport { messages ->
            if (messages.size == 1) {
                acceptForHello(messages.single())
            } else {
                val request =
                    SyncJsonCodec.decodeRequest(messages.last())

                if (!reverseRequestQueued) {
                    val hello =
                        ConnectionJsonCodec.decodeHello(
                            messages.first()
                        )

                    successfulTransport.enqueueIncoming(
                        SyncJsonCodec.encode(
                            org.daovibe.android.core.sync.SyncRequest(
                                protocolVersion =
                                    org.daovibe.android.core.sync
                                        .SYNC_PROTOCOL_VERSION,
                                sessionId = request.sessionId,
                                sourceNodeId = SERVER_NODE,
                                targetNodeId = hello.sourceNodeId,
                                pairingId = request.pairingId,
                                cursor = "0:",
                                limit = 50
                            )
                        )
                    )

                    reverseRequestQueued = true
                }

                SyncJsonCodec.encode(
                    SyncProtocol.createBatch(
                        request = request,
                        packets = emptyList(),
                        nextCursor = request.cursor,
                        hasMore = false
                    )
                )
            }
        }
        val repository = ConnectionRepository(
            database = clientDatabase,
            nowSeconds = { NOW },
            sessionIdFactory = { SESSION_ID },
            peerTransportFactory = {
                factoryCalls += 1
                if (factoryCalls == 1) {
                    error("transport factory failed")
                }
                successfulTransport
            }
        )
        val endpoint = PeerEndpoint("127.0.0.1", 4242)

        val firstResult = repository.syncWithPairedNode(
            remoteNodeId = SERVER_NODE,
            endpoint = endpoint
        )

        assertTrue(firstResult is SyncRunResult.Failed)
        val firstFailure = firstResult as SyncRunResult.Failed
        assertEquals(PeerTransportFailureCode.IO_FAILURE, firstFailure.failure.code)
        assertEquals(ConnectionSessionState.FAILED, firstFailure.session.state)
        assertEquals(
            identityBefore,
            DeviceIdentityRepository(
                clientDatabase.daoVibeDao(),
                nowSeconds = { NOW }
            ).getOrCreate().nodeId
        )
        assertEquals(pairingsBefore, clientDatabase.daoVibeDao().listPairingRecords())
        assertEquals(
            0,
            clientDatabase.daoVibeDao().listPacketsInLedgerOrder().size
        )
        assertEquals(
            null,
            clientDatabase.daoVibeDao().getPeerSyncState(SERVER_NODE)
        )

        val secondResult = repository.syncWithPairedNode(
            remoteNodeId = SERVER_NODE,
            endpoint = endpoint
        )

        assertTrue(secondResult is SyncRunResult.Completed)
        assertEquals(2, factoryCalls)
        assertTrue(successfulTransport.closed)
    }

    @Test
    fun rejectedHandshakeDoesNotSendSyncRequest() = runTest {
        installClientPairing()
        lateinit var transport: SyncScriptedPeerTransport
        transport = SyncScriptedPeerTransport { messages ->
            val hello = ConnectionJsonCodec.decodeHello(messages.single())
            ConnectionJsonCodec.encode(
                ConnectionProtocol.createReject(
                    sessionId = hello.sessionId,
                    sourceNodeId = SERVER_NODE,
                    targetNodeId = hello.sourceNodeId,
                    pairingId = hello.pairingId,
                    rejectedAt = NOW,
                    reason = ConnectionRejectReason.PAIRING_INACTIVE
                )
            )
        }
        val repository = newClientConnectionRepository(transport)

        val result = repository.syncWithPairedNode(
            remoteNodeId = SERVER_NODE,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(result is SyncRunResult.Rejected)
        assertEquals(1, transport.sentMessages.size)
        assertTrue(transport.closed)
    }

    private suspend fun serveLoopbackBidirectionalSync(
        transport: PeerTransport,
        clientNodeId: String
    ): SyncResponderResult {
        val result = SyncResponder(
            database = serverDatabase,
            nowSeconds = { NOW }
        ).serveOnce(transport)
        return result
    }
    private suspend fun installClientPairing(): PairingRecord {
        val identity = DeviceIdentityRepository(
            clientDatabase.daoVibeDao(),
            nowSeconds = { NOW }
        ).getOrCreate()
        clientDatabase.daoVibeDao().upsertPairingRecord(
            pairingEntity(
                pairingId = PAIRING_ID,
                localNodeId = identity.nodeId,
                remoteNodeId = SERVER_NODE,
                status = "approved"
            )
        )
        return PairingRecord(
            pairingId = PAIRING_ID,
            localNodeId = identity.nodeId,
            remoteNodeId = SERVER_NODE,
            remoteDisplayName = "Server Node",
            remotePlatform = "desktop",
            remoteRole = "computer",
            status = PairingRecordStatus.APPROVED,
            createdAt = CREATED_AT,
            pairedAt = CREATED_AT + 1L
        )
    }

    private suspend fun installServerPairing(clientNodeId: String) {
        serverDatabase.daoVibeDao().insertDeviceIdentity(
            DeviceIdentityEntity(
                id = 1,
                nodeId = SERVER_NODE,
                displayName = "Server Node",
                createdAt = CREATED_AT
            )
        )
        serverDatabase.daoVibeDao().upsertPairingRecord(
            pairingEntity(
                pairingId = PAIRING_ID,
                localNodeId = SERVER_NODE,
                remoteNodeId = clientNodeId,
                status = "approved"
            )
        )
    }

    private fun newClientConnectionRepository(
        transport: PeerTransport
    ): ConnectionRepository =
        ConnectionRepository(
            database = clientDatabase,
            nowSeconds = { NOW },
            sessionIdFactory = { SESSION_ID },
            peerTransportFactory = { transport }
        )

    private fun acceptForHello(helloJson: String): String {
        val hello = ConnectionJsonCodec.decodeHello(helloJson)
        return ConnectionJsonCodec.encode(
            ConnectionProtocol.createAccept(
                hello = hello,
                localNodeId = SERVER_NODE,
                pairing = PairingRecord(
                    pairingId = hello.pairingId,
                    localNodeId = SERVER_NODE,
                    remoteNodeId = hello.sourceNodeId,
                    remoteDisplayName = "Phone Node",
                    remotePlatform = "android",
                    remoteRole = "phone",
                    status = PairingRecordStatus.APPROVED,
                    createdAt = CREATED_AT,
                    pairedAt = CREATED_AT + 1L
                ),
                acceptedAt = NOW
            )
        )
    }

    private fun phrasePacket(index: Int) =
        org.daovibe.android.core.protocol.PacketFactory { CREATED_AT }.create(
            packetType =
                org.daovibe.android.core.protocol.PacketType.PHRASE_OBSERVED,
            zone = "connection_sync_test",
            author = SERVER_NODE,
            payload =
                org.daovibe.android.core.protocol.PhraseObservedPayload(
                    phraseId = "phrase_fake_$index",
                    surfaceText = "Fake phrase $index",
                    languageHint = "en",
                    inputType =
                        org.daovibe.android.core.protocol.InputType.TEXT
                ),
            createdAt = CREATED_AT + index
        )

    private fun pairingEntity(
        pairingId: String,
        localNodeId: String,
        remoteNodeId: String,
        status: String
    ): PairingRecordEntity =
        PairingRecordEntity(
            pairingId = pairingId,
            localNodeId = localNodeId,
            remoteNodeId = remoteNodeId,
            remoteDisplayName = "Peer",
            remotePlatform = "desktop",
            remoteRole = "computer",
            status = status,
            createdAt = CREATED_AT,
            pairedAt = CREATED_AT + 1L,
            updatedAt = NOW
        )

    private fun newDatabase(): DaoVibeDatabase =
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()

    private companion object {
        const val SERVER_NODE = "mycelium_node_sync_server"
        const val PAIRING_ID = "pairing_connection_sync"
        const val SESSION_ID = "session_0123456789abcdef0123456789abcdef"
        const val CREATED_AT = 1_700_000_000L
        const val NOW = 1_700_000_100L
    }
}

private class CloseDeferringPeerTransport(
    private val delegate: PeerTransport
) : PeerTransport {
    private var finished = false

    override suspend fun connect(endpoint: PeerEndpoint) {
        delegate.connect(endpoint)
    }

    override suspend fun send(canonicalMessageJson: String) {
        delegate.send(canonicalMessageJson)
    }

    override suspend fun receive(): String =
        delegate.receive()

    override suspend fun close() {
        // Intentionally deferred for the bidirectional
        // loopback test. finish() performs the real close.
    }

    suspend fun finish() {
        if (!finished) {
            finished = true
            delegate.close()
        }
    }
}
private class SyncScriptedPeerTransport(
    private val responseFactory: (List<String>) -> String
) : PeerTransport {
    val sentMessages = mutableListOf<String>()

    private val incomingMessages =
        java.util.ArrayDeque<String>()

    var closed = false
        private set

    fun enqueueIncoming(canonicalMessageJson: String) {
        incomingMessages.addLast(canonicalMessageJson)
    }

    override suspend fun connect(endpoint: PeerEndpoint) = Unit

    override suspend fun send(canonicalMessageJson: String) {
        sentMessages += canonicalMessageJson
    }

    override suspend fun receive(): String =
        if (incomingMessages.isNotEmpty()) {
            incomingMessages.removeFirst()
        } else {
            responseFactory(sentMessages)
        }

    override suspend fun close() {
        closed = true
    }
}
