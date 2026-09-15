package org.daovibe.android.core.connection

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.pairing.PAIRING_PROTOCOL_VERSION
import org.daovibe.android.core.pairing.PairingApproval
import org.daovibe.android.core.pairing.PairingApprovalState
import org.daovibe.android.core.pairing.PairingOffer
import org.daovibe.android.core.pairing.PairingProtocol
import org.daovibe.android.core.pairing.PairingRecord
import org.daovibe.android.core.pairing.PairingRepository
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ConnectionRepositoryTest {
    private lateinit var database: DaoVibeDatabase
    private lateinit var myceliumRepository: LocalMyceliumRepository
    private lateinit var pairingRepository: PairingRepository
    private lateinit var connectionRepository: ConnectionRepository

    @Before
    fun setUp() {
        database = newDatabase()
        myceliumRepository = LocalMyceliumRepository(
            database = database,
            nowSeconds = { NOW }
        )
        pairingRepository = PairingRepository(
            database = database,
            nowSeconds = { NOW }
        )
        connectionRepository = ConnectionRepository(
            database = database,
            nowSeconds = { NOW },
            sessionIdFactory = { SESSION_ID }
        )
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun activePairingAllowsRepositoryHandshakeProgression() = runTest {
        val pairing = createApprovedPairing()

        val hello = connectionRepository.createHello(pairing.remoteNodeId)

        assertEquals(
            ConnectionSessionState.HELLO_SENT,
            connectionRepository.sessions.value.single().state
        )

        val accept = ConnectionProtocol.createAccept(
            hello = hello,
            localNodeId = pairing.remoteNodeId,
            pairing = pairing.copy(
                localNodeId = pairing.remoteNodeId,
                remoteNodeId = pairing.localNodeId
            ),
            acceptedAt = NOW
        )

        val result = connectionRepository.handleAccept(hello, accept)

        assertTrue(result is ConnectionHandshakeResult.Accepted)
        assertEquals(
            ConnectionSessionState.CONNECTED,
            connectionRepository.sessions.value.single().state
        )
    }

    @Test
    fun handshakeDoesNotModifyLocalNodeId() = runTest {
        val localIdentity = myceliumRepository.ensureDeviceIdentity()
        val pairing = createApprovedPairing()

        connectionRepository.createHello(pairing.remoteNodeId)

        val afterHandshake = myceliumRepository.ensureDeviceIdentity()
        assertEquals(localIdentity.nodeId, afterHandshake.nodeId)
        assertEquals(localIdentity.createdAt, afterHandshake.createdAt)
    }

    @Test
    fun handshakeDoesNotModifyExistingPacketAuthors() = runTest {
        val identity = myceliumRepository.ensureDeviceIdentity()
        myceliumRepository.observePhrase("Connection handshake phrase")
        val pairing = createApprovedPairing()
        val authorsBefore = database.daoVibeDao()
            .listPacketsInLedgerOrder()
            .map { it.author }

        connectionRepository.createHello(pairing.remoteNodeId)

        val authorsAfter = database.daoVibeDao()
            .listPacketsInLedgerOrder()
            .map { it.author }
        assertEquals(listOf(identity.nodeId), authorsBefore)
        assertEquals(authorsBefore, authorsAfter)
    }

    @Test
    fun handshakeDoesNotModifyPacketLedger() = runTest {
        val pairing = createApprovedPairing()
        myceliumRepository.observePhrase("Ledger must stay still")
        val before = database.daoVibeDao().listPacketsInLedgerOrder()

        val hello = connectionRepository.createHello(pairing.remoteNodeId)
        val accept = ConnectionProtocol.createAccept(
            hello = hello,
            localNodeId = pairing.remoteNodeId,
            pairing = pairing.copy(
                localNodeId = pairing.remoteNodeId,
                remoteNodeId = pairing.localNodeId
            ),
            acceptedAt = NOW
        )
        connectionRepository.handleAccept(hello, accept)

        assertEquals(before, database.daoVibeDao().listPacketsInLedgerOrder())
    }

    @Test
    fun handshakeDoesNotTriggerLedgerImportOrSync() = runTest {
        val pairing = createApprovedPairing()
        myceliumRepository.observePhrase("No packet sync yet")
        val exportedBefore = myceliumRepository.exportLedgerJson()

        val hello = connectionRepository.createHello(pairing.remoteNodeId)
        val accept = ConnectionProtocol.createAccept(
            hello = hello,
            localNodeId = pairing.remoteNodeId,
            pairing = pairing.copy(
                localNodeId = pairing.remoteNodeId,
                remoteNodeId = pairing.localNodeId
            ),
            acceptedAt = NOW
        )
        connectionRepository.handleAccept(hello, accept)

        assertEquals(exportedBefore, myceliumRepository.exportLedgerJson())
    }

    @Test
    fun rejectedPairingCannotCreateConnectionHello() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "connection-rejected",
            createdAt = CREATED_AT
        )
        val approval = approvalFor(offer, PairingApprovalState.REJECTED)
        pairingRepository.recordPairingApproval(offer, approval)

        val result = runCatching {
            connectionRepository.createHello(approval.approvingNodeId)
        }

        assertTrue(result.isFailure)
        assertEquals(
            ConnectionRejectReason.PAIRING_INACTIVE,
            (result.exceptionOrNull() as ConnectionProtocolException).reason
        )
    }

    @Test
    fun clientSendsCanonicalConnectionHelloAndAcceptNegotiates() = runTest {
        val pairing = createApprovedPairing()
        lateinit var transport: ScriptedPeerTransport
        transport = ScriptedPeerTransport { sentJson ->
            val hello = ConnectionJsonCodec.decodeHello(sentJson)
            ConnectionJsonCodec.encode(
                ConnectionProtocol.createAccept(
                    hello = hello,
                    localNodeId = pairing.remoteNodeId,
                    pairing = pairing.copy(
                        localNodeId = pairing.remoteNodeId,
                        remoteNodeId = pairing.localNodeId
                    ),
                    acceptedAt = NOW
                )
            )
        }
        val repository = newConnectionRepository(transport)

        val result = repository.connectToPairedNode(
            remoteNodeId = pairing.remoteNodeId,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(result is ConnectionHandshakeResult.Accepted)
        assertEquals(1, transport.sentMessages.size)
        val decodedHello = ConnectionJsonCodec.decodeHello(
            transport.sentMessages.single()
        )
        assertEquals(
            transport.sentMessages.single(),
            ConnectionJsonCodec.encode(decodedHello)
        )
        assertEquals(
            ConnectionSessionState.CONNECTED,
            result.session.state
        )
        assertEquals(
            CONNECTION_PROTOCOL_VERSION,
            result.session.negotiatedConnectionVersion
        )
        assertEquals(
            org.daovibe.android.core.protocol.LMP_VERSION,
            result.session.negotiatedPacketProtocolVersion
        )
        assertTrue(transport.closed)
    }

    @Test
    fun validConnectionRejectProducesRejectedSession() = runTest {
        val pairing = createApprovedPairing()
        val transport = ScriptedPeerTransport { sentJson ->
            val hello = ConnectionJsonCodec.decodeHello(sentJson)
            ConnectionJsonCodec.encode(
                ConnectionProtocol.createReject(
                    sessionId = hello.sessionId,
                    sourceNodeId = pairing.remoteNodeId,
                    targetNodeId = pairing.localNodeId,
                    pairingId = hello.pairingId,
                    rejectedAt = NOW,
                    reason = ConnectionRejectReason.PAIRING_INACTIVE
                )
            )
        }
        val repository = newConnectionRepository(transport)

        val result = repository.connectToPairedNode(
            remoteNodeId = pairing.remoteNodeId,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(result is ConnectionHandshakeResult.Rejected)
        assertEquals(
            ConnectionSessionState.REJECTED,
            result.session.state
        )
        assertEquals(
            ConnectionRejectReason.PAIRING_INACTIVE,
            result.session.rejectReason
        )
    }

    @Test
    fun malformedIncomingHelloIsRejectedOrFailedWithoutIntermediateState() =
        runTest {
            val pairing = createApprovedPairing()
            myceliumRepository.observePhrase("Malformed hello must not mutate ledger")
            val identityBefore = myceliumRepository.ensureDeviceIdentity()
            val pairingsBefore = pairingRepository.listPairingRecords()
            val ledgerBefore = database.daoVibeDao().listPacketsInLedgerOrder()
            val malformedHellos = listOf(
                "session" to incomingHello(pairing).copy(
                    sessionId = "malformed_session"
                ),
                "source node" to incomingHello(pairing).copy(
                    sourceNodeId = ""
                ),
                "target node" to incomingHello(pairing).copy(
                    targetNodeId = ""
                ),
                "protocol" to incomingHello(pairing).copy(
                    protocolVersion = "daovibe-connection-v99"
                )
            )

            malformedHellos.forEach { (label, hello) ->
                val result = runCatching {
                    connectionRepository.handleHello(hello, acceptedAt = NOW)
                }

                assertTrue("$label hello must not throw", result.isSuccess)
                val handshake = result.getOrThrow()
                assertTrue(
                    "$label hello must end rejected or failed",
                    handshake.session.state == ConnectionSessionState.REJECTED ||
                        handshake.session.state == ConnectionSessionState.FAILED
                )
                assertTrue(
                    "$label hello must not remain intermediate",
                    handshake.session.state != ConnectionSessionState.HELLO_RECEIVED
                )
                assertTrue(
                    "$label hello must not connect",
                    handshake.session.state != ConnectionSessionState.CONNECTED
                )
            }

            assertTrue(
                connectionRepository.sessions.value.none {
                    it.state == ConnectionSessionState.HELLO_RECEIVED ||
                        it.state == ConnectionSessionState.CONNECTED
                }
            )
            assertEquals(identityBefore, myceliumRepository.ensureDeviceIdentity())
            assertEquals(pairingsBefore, pairingRepository.listPairingRecords())
            assertEquals(ledgerBefore, database.daoVibeDao().listPacketsInLedgerOrder())
        }

    @Test
    fun responseWithWrongSessionIdFailsHandshake() = runTest {
        val pairing = createApprovedPairing()
        val transport = ScriptedPeerTransport { sentJson ->
            val hello = ConnectionJsonCodec.decodeHello(sentJson)
            ConnectionJsonCodec.encode(
                ConnectionProtocol.createAccept(
                    hello = hello,
                    localNodeId = pairing.remoteNodeId,
                    pairing = pairing.copy(
                        localNodeId = pairing.remoteNodeId,
                        remoteNodeId = pairing.localNodeId
                    ),
                    acceptedAt = NOW
                ).copy(
                    sessionId = "session_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                )
            )
        }
        val repository = newConnectionRepository(transport)

        val result = repository.connectToPairedNode(
            remoteNodeId = pairing.remoteNodeId,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(result is ConnectionHandshakeResult.Failed)
        assertEquals(
            ConnectionSessionState.FAILED,
            result.session.state
        )
        assertEquals(
            PeerTransportFailureCode.INVALID_MESSAGE,
            (result as ConnectionHandshakeResult.Failed).failure.code
        )
    }

    @Test
    fun responseWithWrongPeerNodeIdFailsHandshake() = runTest {
        val pairing = createApprovedPairing()
        val transport = ScriptedPeerTransport { sentJson ->
            val hello = ConnectionJsonCodec.decodeHello(sentJson)
            ConnectionJsonCodec.encode(
                ConnectionProtocol.createAccept(
                    hello = hello,
                    localNodeId = pairing.remoteNodeId,
                    pairing = pairing.copy(
                        localNodeId = pairing.remoteNodeId,
                        remoteNodeId = pairing.localNodeId
                    ),
                    acceptedAt = NOW
                ).copy(
                    sourceNodeId = "mycelium_node_wrong_peer"
                )
            )
        }
        val repository = newConnectionRepository(transport)

        val result = repository.connectToPairedNode(
            remoteNodeId = pairing.remoteNodeId,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(result is ConnectionHandshakeResult.Failed)
        assertEquals(ConnectionSessionState.FAILED, result.session.state)
    }

    @Test
    fun timeoutFailureDoesNotChangeIdentityPairingOrPacketLedger() = runTest {
        val pairing = createApprovedPairing()
        myceliumRepository.observePhrase("Transport failure leaves ledger alone")
        val identityBefore = myceliumRepository.ensureDeviceIdentity()
        val pairingsBefore = pairingRepository.listPairingRecords()
        val ledgerBefore = database.daoVibeDao().listPacketsInLedgerOrder()
        val transport = ScriptedPeerTransport(
            connectFailure = PeerTransportException(
                code = PeerTransportFailureCode.TIMEOUT,
                message = "Peer connect timed out."
            )
        )
        val repository = newConnectionRepository(transport)

        val result = repository.connectToPairedNode(
            remoteNodeId = pairing.remoteNodeId,
            endpoint = PeerEndpoint("198.51.100.10", 4242)
        )

        assertTrue(result is ConnectionHandshakeResult.Failed)
        assertEquals(
            PeerTransportFailureCode.TIMEOUT,
            (result as ConnectionHandshakeResult.Failed).failure.code
        )
        assertEquals(ConnectionSessionState.FAILED, result.session.state)
        assertTrue(transport.closed)
        assertEquals(identityBefore, myceliumRepository.ensureDeviceIdentity())
        assertEquals(pairingsBefore, pairingRepository.listPairingRecords())
        assertEquals(ledgerBefore, database.daoVibeDao().listPacketsInLedgerOrder())
        assertEquals(
            1,
            database.daoVibeDao().listPhrases().size
        )
    }

    @Test
    fun connectionRefusalProducesFailureState() = runTest {
        val pairing = createApprovedPairing()
        val transport = ScriptedPeerTransport(
            connectFailure = PeerTransportException(
                code = PeerTransportFailureCode.CONNECTION_REFUSED,
                message = "Peer endpoint refused the connection."
            )
        )
        val repository = newConnectionRepository(transport)

        val result = repository.connectToPairedNode(
            remoteNodeId = pairing.remoteNodeId,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(result is ConnectionHandshakeResult.Failed)
        assertEquals(
            PeerTransportFailureCode.CONNECTION_REFUSED,
            (result as ConnectionHandshakeResult.Failed).failure.code
        )
        assertEquals(ConnectionSessionState.FAILED, result.session.state)
        assertTrue(transport.closed)
    }

    @Test
    fun transportFactoryFailureReleasesAttemptMutexForNextAttempt() = runTest {
        val pairing = createApprovedPairing()
        val successfulTransport = ScriptedPeerTransport { sentJson ->
            val hello = ConnectionJsonCodec.decodeHello(sentJson)
            ConnectionJsonCodec.encode(
                ConnectionProtocol.createAccept(
                    hello = hello,
                    localNodeId = pairing.remoteNodeId,
                    pairing = pairing.copy(
                        localNodeId = pairing.remoteNodeId,
                        remoteNodeId = pairing.localNodeId
                    ),
                    acceptedAt = NOW
                )
            )
        }
        var factoryCalls = 0
        val repository = ConnectionRepository(
            database = database,
            nowSeconds = { NOW },
            sessionIdFactory = { SESSION_ID },
            peerTransportFactory = {
                factoryCalls += 1
                if (factoryCalls == 1) {
                    error("transport factory failure")
                }
                successfulTransport
            }
        )

        val firstResult = repository.connectToPairedNode(
            remoteNodeId = pairing.remoteNodeId,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(firstResult is ConnectionHandshakeResult.Failed)
        assertEquals(
            PeerTransportFailureCode.IO_FAILURE,
            (firstResult as ConnectionHandshakeResult.Failed).failure.code
        )
        assertEquals(ConnectionSessionState.FAILED, firstResult.session.state)

        val secondResult = repository.connectToPairedNode(
            remoteNodeId = pairing.remoteNodeId,
            endpoint = PeerEndpoint("127.0.0.1", 4242)
        )

        assertTrue(secondResult is ConnectionHandshakeResult.Accepted)
        assertEquals(2, factoryCalls)
        assertTrue(successfulTransport.closed)
    }

    @Test
    fun databaseRecreationPreservesPairingPrerequisiteBehavior() = runTest {
        val path = File(
            ApplicationProvider.getApplicationContext<android.content.Context>().cacheDir,
            "connection-pairing-recreation.db"
        )
        path.delete()

        val firstDatabase = Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java,
            path.absolutePath
        ).allowMainThreadQueries().build()

        val firstPairingRepository = PairingRepository(
            firstDatabase,
            nowSeconds = { NOW }
        )
        val offer = firstPairingRepository.createPairingOffer(
            challenge = "connection-persisted",
            createdAt = CREATED_AT
        )
        val approval = approvalFor(offer, PairingApprovalState.APPROVED)
        firstPairingRepository.recordPairingApproval(offer, approval)
        firstDatabase.close()

        val secondDatabase = Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java,
            path.absolutePath
        ).allowMainThreadQueries().build()

        try {
            val secondConnectionRepository = ConnectionRepository(
                secondDatabase,
                nowSeconds = { NOW },
                sessionIdFactory = { SESSION_ID }
            )
            val hello = secondConnectionRepository.createHello(
                approval.approvingNodeId
            )

            assertEquals(offer.pairingId, hello.pairingId)
            assertEquals(approval.approvingNodeId, hello.targetNodeId)
        } finally {
            secondDatabase.close()
            path.delete()
        }
    }

    private fun newDatabase(): DaoVibeDatabase =
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()

    private suspend fun createApprovedPairing(): PairingRecord {
        val offer = pairingRepository.createPairingOffer(
            challenge = "connection-approved",
            createdAt = CREATED_AT
        )
        return pairingRepository.recordPairingApproval(
            offer = offer,
            approval = approvalFor(offer, PairingApprovalState.APPROVED)
        )
    }

    private fun incomingHello(pairing: PairingRecord): ConnectionHello =
        ConnectionProtocol.createHello(
            localNodeId = pairing.remoteNodeId,
            pairing = pairing.copy(
                localNodeId = pairing.remoteNodeId,
                remoteNodeId = pairing.localNodeId
            ),
            sourcePlatform = "desktop",
            sourceRole = PairingProtocol.COMPUTER_ROLE,
            sessionId = SESSION_ID,
            createdAt = CREATED_AT
        )

    private fun approvalFor(
        offer: PairingOffer,
        state: PairingApprovalState
    ): PairingApproval =
        PairingApproval(
            protocolVersion = PAIRING_PROTOCOL_VERSION,
            pairingId = offer.pairingId,
            approvingNodeId = COMPUTER_NODE,
            approvingDisplayName = "Desk Node",
            approvingPlatform = "desktop",
            approvingRole = PairingProtocol.COMPUTER_ROLE,
            targetNodeId = offer.sourceNodeId,
            approvedAt = NOW,
            approvalState = state,
            challengeEcho = offer.challenge
        )

    private fun newConnectionRepository(
        transport: PeerTransport
    ): ConnectionRepository =
        ConnectionRepository(
            database = database,
            nowSeconds = { NOW },
            sessionIdFactory = { SESSION_ID },
            peerTransportFactory = { transport }
        )

    private companion object {
        const val COMPUTER_NODE = "mycelium_node_computer"
        const val SESSION_ID = "session_0123456789abcdef0123456789abcdef"
        const val CREATED_AT = 1_700_000_000L
        const val NOW = 1_700_000_100L
    }
}

private class ScriptedPeerTransport(
    private val connectFailure: PeerTransportException? = null,
    private val responseFactory: ((String) -> String)? = null
) : PeerTransport {
    val sentMessages = mutableListOf<String>()
    var closed = false
        private set

    override suspend fun connect(endpoint: PeerEndpoint) {
        connectFailure?.let { throw it }
    }

    override suspend fun send(canonicalMessageJson: String) {
        sentMessages += canonicalMessageJson
    }

    override suspend fun receive(): String =
        responseFactory?.invoke(sentMessages.single())
            ?: error("No scripted response configured")

    override suspend fun close() {
        closed = true
    }
}
