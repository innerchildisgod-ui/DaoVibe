package org.daovibe.android.core.mycelium

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class MyceliumStateCorrectionTombstoneTest {
    private lateinit var database: DaoVibeDatabase

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(), DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = database.close()

    @Test
    fun sharedFixtureDerivesEffectiveTombstoneAndFallback() = runTest {
        val root = JSONObject(
            javaClass.classLoader?.getResource("fixtures/mycelium_state_correction_tombstone.json")
                ?.readText() ?: error("Missing tombstone fixture")
        )
        val packets = root.getJSONArray("packets").let { array ->
            (0 until array.length()).map { PacketJsonCodec.decode(array.getJSONObject(it)) }
        }
        val repository = LocalMyceliumRepository(database)
        packets.forEach { packet ->
            assertTrue(repository.receivePacket(packet).decision == PacketReceiveDecision.ACCEPTED_NEW)
        }
        val snapshot = MyceliumStateSnapshot.fromState(repository.rebuildDerivedStateFromLedger())
        assertEquals(root.getString("expected_snapshot_canonical_json"), snapshot.toCanonicalJson())
        assertEquals(root.getInt("expected_utf8_byte_length"), snapshot.toCanonicalJson().toByteArray(Charsets.UTF_8).size)
        assertEquals(root.getString("expected_fingerprint"), snapshot.fingerprint())
        val correction = snapshot.phrases.single().meanings.single().corrections
            .first { it.correctionId == "correction_𐀀" }
        assertTrue(correction.tombstoned)
        assertEquals("tombstone_𐀀", correction.effectiveTombstoneId)
        assertEquals("correction_", snapshot.phrases.single().meanings.single().effectiveCorrectionId)
    }
}
