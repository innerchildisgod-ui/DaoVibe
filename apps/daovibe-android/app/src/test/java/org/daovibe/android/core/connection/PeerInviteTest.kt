package org.daovibe.android.core.connection

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.protocol.LMP_VERSION
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.DeviceIdentityEntity
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.mycelium.MyceliumStateSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class PeerInviteTest {
    private lateinit var database: DaoVibeDatabase

    @Before fun setUp() { database = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), DaoVibeDatabase::class.java).allowMainThreadQueries().build() }
    @After fun tearDown() { database.close() }

    @Test fun fixtureCanonicalBytesAndHashMatch() {
        val json = javaClass.classLoader!!.getResource("fixtures/mycelium_peer_invite.json")!!.readText()
        val invite = PeerInviteCodec.decodeCanonical(json, 1_700_000_001)
        assertEquals(353, invite.canonicalJson().toByteArray(Charsets.UTF_8).size)
        assertEquals("957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9", invite.inviteId())
        assertEquals("daovibe://peer-invite?v=1&data=eyJjYXBhYmlsaXRpZXMiOlsibXljZWxpdW0iLCJwYWNrZXRfbGVkZ2VyIl0sImNvbm5lY3Rpb25fdmVyc2lvbiI6ImRhb3ZpYmUtY29ubmVjdGlvbi12MSIsImNyZWF0ZWRfYXQiOjE3MDAwMDAwMDAsImV4cGlyZXNfYXQiOjE5MDAwMDAwMDAsImhvc3QiOiIxMjcuMC4wLjEiLCJpbnZpdGVfdmVyc2lvbiI6MSwibm90ZSI6ImZpeHR1cmUiLCJwYWNrZXRfcHJvdG9jb2xfdmVyc2lvbiI6ImxtcC8wLjEiLCJwYWlyaW5nX2lkIjoicGFpcmluZ19maXh0dXJlXzAxIiwicG9ydCI6NDI0Miwic291cmNlX2Rpc3BsYXlfbmFtZSI6IkZpeHR1cmUgTm9kZSIsInNvdXJjZV9ub2RlX2lkIjoibXljZWxpdW1fZml4dHVyZV9ub2RlIn0", PeerInviteCodec.encodePayload(invite))
    }

    @Test fun payloadRoundTripsExactly() {
        val invite = sample()
        assertEquals(invite, PeerInviteCodec.decodePayload(PeerInviteCodec.encodePayload(invite), 1_700_000_001))
    }

    @Test fun malformedOversizedAndUnsupportedPayloadsReject() {
        assertReject { PeerInviteCodec.decodePayload("daovibe://peer-invite?v=2&data=x", 1) }
        assertReject { PeerInviteCodec.decodePayload("daovibe://peer-invite?v=1&data=%%%", 1) }
        assertReject { PeerInviteCodec.decodePayload("x".repeat(MAX_PEER_INVITE_TEXT_LENGTH + 1), 1) }
    }

    @Test fun validationRejectsExpiryVersionsFieldsAndPort() {
        assertReject { PeerInviteCodec.validate(sample().copy(expiresAt = 1_700_000_000), 1_700_000_000) }
        assertReject { PeerInviteCodec.validate(sample().copy(inviteVersion = 2), 1) }
        assertReject { PeerInviteCodec.validate(sample().copy(connectionVersion = "old"), 1) }
        assertReject { PeerInviteCodec.validate(sample().copy(packetProtocolVersion = "old"), 1) }
        assertReject { PeerInviteCodec.validate(sample().copy(sourceNodeId = " "), 1) }
        assertReject { PeerInviteCodec.validate(sample().copy(host = " "), 1) }
        assertReject { PeerInviteCodec.validate(sample().copy(pairingId = " "), 1) }
        assertReject { PeerInviteCodec.validate(sample().copy(port = 0), 1) }
    }

    @Test fun importUpdatesByRemoteNodeAndLeavesLedgerUntouched() = runTest {
        database.daoVibeDao().insertDeviceIdentity(DeviceIdentityEntity(1, "local", "Local", 1))
        val repo = PeerRegistryRepository(database, nowSeconds = { 2 })
        repo.importInvite(sample())
        repo.importInvite(sample().copy(host = "new-host", port = 4343))
        assertEquals(1, repo.listPeers().size)
        assertEquals("new-host", repo.getPeer("remote")?.host)
        assertTrue(database.daoVibeDao().listPacketsInLedgerOrder().isEmpty())
    }

    @Test fun repositoryImportValidatesInviteAndPreservesSemanticState() = runTest {
        database.daoVibeDao().insertDeviceIdentity(DeviceIdentityEntity(1, "local", "Local", 1))
        val mycelium = LocalMyceliumRepository(database, nowSeconds = { 1_700_000_001 })
        val before = MyceliumStateSnapshot.fromState(mycelium.rebuildDerivedStateFromLedger()).fingerprint()
        val repo = PeerRegistryRepository(database, nowSeconds = { 1_700_000_001 })
        repo.importInvite(sample())
        assertRejectSuspend { repo.importInvite(sample().copy(expiresAt = 1_700_000_001)) }
        assertRejectSuspend { repo.importInvite(sample().copy(inviteVersion = 2)) }
        assertRejectSuspend { repo.importInvite(sample().copy(connectionVersion = "old")) }
        assertRejectSuspend { repo.importInvite(sample().copy(packetProtocolVersion = "old")) }
        assertRejectSuspend { repo.importInvite(sample().copy(host = " ")) }
        assertRejectSuspend { repo.importInvite(sample().copy(port = 0)) }
        val after = MyceliumStateSnapshot.fromState(mycelium.rebuildDerivedStateFromLedger()).fingerprint()
        assertEquals(before, after)
        assertTrue(database.daoVibeDao().listPacketsInLedgerOrder().isEmpty())
    }

    @Test fun rejectsNonCanonicalBase64TrailingBits() {
        val canonical = PeerInviteCodec.encodePayload(sample())
        val data = canonical.substringAfter("&data=")
        assertReject { PeerInviteCodec.decodePayload(canonical.substringBefore("&data=") + "&data=" + data + "A", 1_700_000_001) }
    }

    @Test fun localNodeInviteRejects() = runTest {
        database.daoVibeDao().insertDeviceIdentity(DeviceIdentityEntity(1, "local", "Local", 1))
        assertRejectSuspend { PeerRegistryRepository(database).importInvite(sample().copy(sourceNodeId = "local")) }
    }

    private fun sample() = PeerInvite(sourceNodeId = "remote", host = "127.0.0.1", port = 4242, pairingId = "pair", createdAt = 1_700_000_000, expiresAt = 1_800_000_000, packetProtocolVersion = LMP_VERSION)
    private fun assertReject(action: () -> Unit) { try { action() } catch (_: Exception) { return }; throw AssertionError("expected rejection") }
    private suspend fun assertRejectSuspend(action: suspend () -> Unit) { try { action() } catch (_: Exception) { return }; throw AssertionError("expected rejection") }
}
