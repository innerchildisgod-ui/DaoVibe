package org.daovibe.android.core.mycelium

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.StableJson
import org.daovibe.android.core.protocol.estimatePacketSize
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.PacketEntity
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
class MyceliumStateCanonicalizationEdgeTest {
    private lateinit var database: DaoVibeDatabase
    private lateinit var repository: LocalMyceliumRepository
    private lateinit var fixture: CanonicalizationEdgeFixture

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()
        repository = LocalMyceliumRepository(
            database = database,
            nowSeconds = { 1_701_100_100L }
        )
        fixture = CanonicalizationEdgeFixture.load()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun fixtureMatchesExactCanonicalJsonAndFixedFingerprint() = runTest {
        fixture.packets.forEachIndexed { index, packet ->
            assertEquals(
                PacketReceiveDecision.ACCEPTED_NEW,
                repository.receivePacket(packet, receivedAt = 1_701_100_100L + index)
                    .decision
            )
        }

        val snapshot = snapshot()
        assertEquals(fixture.expectedSnapshotCanonicalJson, snapshot.toCanonicalJson())
        assertEquals(fixture.expectedSnapshotCanonicalJson.toByteArray(Charsets.UTF_8).size, 879)
        assertEquals(fixture.expectedFingerprint, snapshot.fingerprint())
    }

    @Test
    fun reversedFixtureOrderProducesTheSameCanonicalJsonAndFingerprint() = runTest {
        fixture.packets.reversed().forEachIndexed { index, packet ->
            database.daoVibeDao().insertPacket(packet.toEntity(1_701_100_200L + index))
        }

        val snapshot = snapshot()
        assertEquals(fixture.expectedSnapshotCanonicalJson, snapshot.toCanonicalJson())
        assertEquals(fixture.expectedFingerprint, snapshot.fingerprint())
    }

    @Test
    fun duplicateFixturePacketsDoNotChangeCanonicalJsonOrFingerprint() = runTest {
        fixture.packets.forEachIndexed { index, packet ->
            repository.receivePacket(packet, receivedAt = 1_701_100_300L + index)
        }
        fixture.packets.forEachIndexed { index, packet ->
            assertEquals(
                PacketReceiveDecision.ALREADY_STORED,
                repository.receivePacket(packet, receivedAt = 1_701_100_400L + index)
                    .decision
            )
        }

        val snapshot = snapshot()
        assertEquals(fixture.expectedSnapshotCanonicalJson, snapshot.toCanonicalJson())
        assertEquals(fixture.expectedFingerprint, snapshot.fingerprint())
    }

    @Test
    fun conflictingDuplicateCannotProduceFingerprintInEitherOrder() = runTest {
        val original = fixture.packets.first()
        val conflict = original.copy(zone = "conflict")
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()

        for (packets in listOf(listOf(original, conflict), listOf(conflict, original))) {
            val result = runCatching {
                MyceliumStateDiagnostic.snapshot(context, packets.map { it.toEntity(1L) }).fingerprint()
            }
            assertTrue(result.exceptionOrNull() is IllegalArgumentException)
            assertEquals(
                "Conflicting duplicate packet_id: ${original.packetId}",
                result.exceptionOrNull()?.message
            )
        }
    }

    private suspend fun snapshot(): MyceliumStateSnapshot =
        MyceliumStateSnapshot.fromState(repository.rebuildDerivedStateFromLedger())

    private fun LmpPacket<PacketPayload>.toEntity(receivedAt: Long): PacketEntity {
        val payloadMap = payload.toStableMap()
        val size = estimatePacketSize(this)
        return PacketEntity(
            packetId = packetId,
            packetType = packetType.wireValue,
            zone = zone,
            author = author,
            parent = parent,
            phraseId = payloadMap["phrase_id"] as? String,
            meaningId = payloadMap["meaning_id"] as? String,
            payloadHash = payloadHash,
            payloadJson = StableJson.stringify(payloadMap),
            packetJson = PacketJsonCodec.encode(this),
            packetSizeBytes = size.bytes,
            packetSizeClass = size.sizeClass.wireValue,
            sizeRecommendation = size.recommendation,
            createdAt = createdAt,
            receivedAt = receivedAt
        )
    }
}

private data class CanonicalizationEdgeFixture(
    val expectedSnapshotCanonicalJson: String,
    val expectedFingerprint: String,
    val packets: List<LmpPacket<PacketPayload>>
) {
    companion object {
        fun load(): CanonicalizationEdgeFixture {
            val json = CanonicalizationEdgeFixture::class.java.classLoader
                ?.getResource("fixtures/mycelium_state_canonicalization_edge.json")
                ?.readText()
                ?: error("Missing Mycelium canonicalization edge fixture")
            val root = JSONObject(json)
            val packetArray = root.getJSONArray("packets")
            return CanonicalizationEdgeFixture(
                expectedSnapshotCanonicalJson = root.getString("expected_snapshot_canonical_json"),
                expectedFingerprint = root.getString("expected_fingerprint"),
                packets = (0 until packetArray.length()).map { index ->
                    PacketJsonCodec.decode(packetArray.getJSONObject(index))
                }
            )
        }
    }
}
