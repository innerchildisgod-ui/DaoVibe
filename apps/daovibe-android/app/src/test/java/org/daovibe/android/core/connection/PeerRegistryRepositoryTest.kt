package org.daovibe.android.core.connection

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
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
class PeerRegistryRepositoryTest {
    private lateinit var database: DaoVibeDatabase

    @Before fun setUp() { database = newDatabase() }
    @After fun tearDown() { database.close() }

    @Test fun addMultiplePeersAndUpdateByStableId() = runTest {
        val repo = PeerRegistryRepository(database, nowSeconds = { 10 })
        repo.addOrUpdate("peer-b", " 10.0.0.2 ", 4242, "pair-b", "B")
        repo.addOrUpdate("peer-a", "10.0.0.1", 4243, "pair-a")
        repo.addOrUpdate("peer-b", "10.0.0.20", 4244, "pair-b2", "B2")
        assertEquals(listOf("peer-a", "peer-b"), repo.listPeers().map { it.remoteNodeId })
        assertEquals("10.0.0.20", repo.getPeer("peer-b")?.host)
        assertEquals("pair-b2", repo.getPeer("peer-b")?.pairingId)
    }

    @Test fun validatesLocalBlankHostAndPort() = runTest {
        val repo = PeerRegistryRepository(database, nowSeconds = { 1 })
        database.daoVibeDao().insertDeviceIdentity(org.daovibe.android.core.storage.DeviceIdentityEntity(1, "local", "Local", 1))
        assertReject { repo.addOrUpdate("local", "x", 1, "p") }
        assertReject { repo.addOrUpdate("remote", " ", 1, "p") }
        assertReject { repo.addOrUpdate("remote", "x", 0, "p") }
        assertReject { repo.addOrUpdate("remote", "x", 65536, "p") }
    }

    @Test fun removePeerLeavesLedgerUntouched() = runTest {
        val repo = PeerRegistryRepository(database, nowSeconds = { 2 })
        repo.addOrUpdate("remote", "127.0.0.1", 4242, "pair")
        database.daoVibeDao().insertPacket(
            org.daovibe.android.core.storage.PacketEntity("packet", "phrase_observed", "z", "author", null, null, null, "hash", "{}", "{}", 2, "small", "ok", 1, 1)
        )
        repo.remove("remote")
        assertTrue(repo.listPeers().isEmpty())
        assertEquals(1, database.daoVibeDao().listPacketsInLedgerOrder().size)
    }

    @Test fun persistsAcrossReopen() = runTest {
        val path = File.createTempFile("daovibe-peers", ".db")
        database.close()
        var first = Room.databaseBuilder(ApplicationProvider.getApplicationContext(), DaoVibeDatabase::class.java, path.absolutePath).allowMainThreadQueries().build()
        PeerRegistryRepository(first, nowSeconds = { 3 }).addOrUpdate("remote", "host", 42, "pair")
        first.close()
        val reopened = Room.databaseBuilder(ApplicationProvider.getApplicationContext(), DaoVibeDatabase::class.java, path.absolutePath).allowMainThreadQueries().build()
        assertEquals("host", PeerRegistryRepository(reopened).getPeer("remote")?.host)
        reopened.close(); path.delete()
        database = newDatabase()
    }

    private fun newDatabase() = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), DaoVibeDatabase::class.java).allowMainThreadQueries().build()

    private suspend fun assertReject(action: suspend () -> Unit) {
        try { action() } catch (_: PeerRegistryException) { return }
        throw AssertionError("expected peer validation failure")
    }
}
