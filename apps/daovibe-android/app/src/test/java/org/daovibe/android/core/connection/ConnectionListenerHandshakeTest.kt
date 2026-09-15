package org.daovibe.android.core.connection

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.daovibe.android.core.identity.DeviceIdentityRepository
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.DeviceIdentityEntity
import org.daovibe.android.core.storage.PairingRecordEntity
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ConnectionListenerHandshakeTest {
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
    fun simulatedClientAndListenerExchangeCompletesHandshake() = runTest {
        val clientIdentity = DeviceIdentityRepository(
            clientDatabase.daoVibeDao(),
            nowSeconds = { NOW }
        ).getOrCreate()
        serverDatabase.daoVibeDao().insertDeviceIdentity(
            DeviceIdentityEntity(
                id = 1,
                nodeId = SERVER_NODE,
                displayName = "Desktop Node",
                createdAt = CREATED_AT
            )
        )
        val pairingId = "pairing_listener_001"
        clientDatabase.daoVibeDao().upsertPairingRecord(
            pairing(
                pairingId = pairingId,
                localNodeId = clientIdentity.nodeId,
                remoteNodeId = SERVER_NODE,
                remoteDisplayName = "Desktop Node",
                remotePlatform = "desktop",
                remoteRole = "computer"
            )
        )
        serverDatabase.daoVibeDao().upsertPairingRecord(
            pairing(
                pairingId = pairingId,
                localNodeId = SERVER_NODE,
                remoteNodeId = clientIdentity.nodeId,
                remoteDisplayName = "Phone Node",
                remotePlatform = "android",
                remoteRole = "phone"
            )
        )

        val clientRepository = ConnectionRepository(
            database = clientDatabase,
            nowSeconds = { NOW },
            sessionIdFactory = { SESSION_ID }
        )
        val serverRepository = ConnectionRepository(
            database = serverDatabase,
            nowSeconds = { NOW }
        )
        val listener = TcpPeerListener(
            bindHost = "127.0.0.1",
            acceptTimeoutMillis = 2_000,
            readTimeoutMillis = 2_000
        )
        val endpoint = listener.start(0)
        val serverJob = async(Dispatchers.IO) {
            val transport = listener.accept()
            try {
                val hello = ConnectionJsonCodec.decodeHello(transport.receive())
                val result = serverRepository.handleHello(
                    hello = hello,
                    acceptedAt = NOW
                )
                when (result) {
                    is ConnectionHandshakeResult.Accepted ->
                        transport.send(ConnectionJsonCodec.encode(result.message))
                    is ConnectionHandshakeResult.Rejected ->
                        transport.send(ConnectionJsonCodec.encode(result.message))
                    is ConnectionHandshakeResult.Failed ->
                        error("Listener handshake unexpectedly failed")
                }
                result
            } finally {
                transport.close()
            }
        }

        try {
            val clientResult = clientRepository.connectToPairedNode(
                remoteNodeId = SERVER_NODE,
                endpoint = endpoint
            )
            val serverResult = withTimeout(5_000) { serverJob.await() }

            assertTrue(clientResult is ConnectionHandshakeResult.Accepted)
            assertTrue(serverResult is ConnectionHandshakeResult.Accepted)
            assertEquals(
                ConnectionSessionState.CONNECTED,
                clientResult.session.state
            )
            assertEquals(
                ConnectionSessionState.CONNECTED,
                serverResult.session.state
            )
            assertNotEquals(clientIdentity.nodeId, SERVER_NODE)
            assertEquals(
                clientIdentity.nodeId,
                serverResult.session.remoteNodeId
            )
        } finally {
            listener.stop()
        }
    }

    private fun newDatabase(): DaoVibeDatabase =
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()

    private fun pairing(
        pairingId: String,
        localNodeId: String,
        remoteNodeId: String,
        remoteDisplayName: String,
        remotePlatform: String,
        remoteRole: String
    ): PairingRecordEntity =
        PairingRecordEntity(
            pairingId = pairingId,
            localNodeId = localNodeId,
            remoteNodeId = remoteNodeId,
            remoteDisplayName = remoteDisplayName,
            remotePlatform = remotePlatform,
            remoteRole = remoteRole,
            status = "approved",
            createdAt = CREATED_AT,
            pairedAt = CREATED_AT + 1,
            updatedAt = NOW
        )

    private companion object {
        const val SERVER_NODE = "mycelium_node_desktop"
        const val SESSION_ID = "session_0123456789abcdef0123456789abcdef"
        const val CREATED_AT = 1_700_000_000L
        const val NOW = 1_700_000_100L
    }
}
