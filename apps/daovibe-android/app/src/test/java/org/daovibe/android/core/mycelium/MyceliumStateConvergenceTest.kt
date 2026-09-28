package org.daovibe.android.core.mycelium

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class MyceliumStateConvergenceTest {
    // Independently hashed from the fixture's 971 UTF-8 bytes using .NET SHA256.
    private val expectedFingerprint =
        "aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0"
    private lateinit var database: DaoVibeDatabase
    private lateinit var repository: LocalMyceliumRepository
    private lateinit var fixture: ConvergenceFixture

    @Before
    fun setUp() {
        database = newDatabase()
        repository = LocalMyceliumRepository(
            database = database,
            nowSeconds = { 1_701_000_200L }
        )
        fixture = ConvergenceFixture.load()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun sharedFixtureMatchesCanonicalSnapshot() = runTest {
        fixture.packets.forEachIndexed { index, packet ->
            val result = repository.receivePacket(
                packet = packet,
                receivedAt = 1_701_000_200L + index
            )
            assertEquals(PacketReceiveDecision.ACCEPTED_NEW, result.decision)
        }

        val snapshot = MyceliumStateSnapshot.fromState(
            repository.rebuildDerivedStateFromLedger()
        )

        assertEquals(fixture.expectedSnapshotCanonicalJson, snapshot.toCanonicalJson())
        assertEquals(expectedFingerprint, snapshot.fingerprint())
    }

    @Test
    fun reversedLedgerInsertionProducesSameCanonicalSnapshot() = runTest {
        fixture.packets.reversed().forEachIndexed { index, packet ->
            database.daoVibeDao().insertPacket(
                packet.toEntity(receivedAt = 1_701_000_300L + index)
            )
        }

        val snapshot = MyceliumStateSnapshot.fromState(
            repository.rebuildDerivedStateFromLedger()
        )

        assertEquals(fixture.expectedSnapshotCanonicalJson, snapshot.toCanonicalJson())
        assertEquals(expectedFingerprint, snapshot.fingerprint())
    }

    @Test
    fun duplicateDeliveryDoesNotChangeCanonicalSnapshot() = runTest {
        fixture.packets.forEachIndexed { index, packet ->
            repository.receivePacket(packet, receivedAt = 1_701_000_200L + index)
        }
        val before = MyceliumStateSnapshot.fromState(
            repository.rebuildDerivedStateFromLedger()
        ).toCanonicalJson()

        val duplicate = repository.receivePacket(
            fixture.packets.first(),
            receivedAt = 1_701_001_000L
        )
        val after = MyceliumStateSnapshot.fromState(
            repository.rebuildDerivedStateFromLedger()
        ).toCanonicalJson()

        assertEquals(PacketReceiveDecision.ALREADY_STORED, duplicate.decision)
        assertEquals(before, after)
        assertEquals(fixture.expectedSnapshotCanonicalJson, after)
        assertEquals(expectedFingerprint, MyceliumStateSnapshot.fromState(
            repository.rebuildDerivedStateFromLedger()
        ).fingerprint())
    }

    @Test
    fun diagnosticReplaysCapturedLedgerWithoutMutatingResidentState() = runTest {
        // Deliberately leave resident derived tables empty: diagnostic must use the ledger.
        fixture.packets.forEachIndexed { index, packet ->
            database.daoVibeDao().insertPacket(packet.toEntity(1_701_000_200L + index))
        }
        val dao = database.daoVibeDao()
        val ledger = dao.listPacketsForReplay()
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        for (delivery in listOf(ledger, ledger.reversed(), ledger + ledger)) {
            val snapshot = MyceliumStateDiagnostic.snapshot(context, delivery)
            assertEquals(fixture.expectedSnapshotCanonicalJson, snapshot.toCanonicalJson())
            assertEquals(expectedFingerprint, snapshot.fingerprint())
        }
        // Each call creates and closes a new Room database and repository (reconstruction).
        assertEquals(expectedFingerprint, MyceliumStateDiagnostic.snapshot(context, ledger).fingerprint())
        assertEquals(ledger, dao.listPacketsForReplay())
        assertTrue(dao.listPhrases().isEmpty())
        assertTrue(dao.listMeanings().isEmpty())
        assertTrue(dao.listVotes().isEmpty())
        assertNull(repository.identityRepository.observeIdentity().first())
    }

    @Test
    fun conflictingDuplicateCannotProduceDiagnosticHashInEitherOrder() = runTest {
        val original = fixture.packets.first()
        val conflict = original.copy(zone = "conflict")
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        for (packets in listOf(listOf(original, conflict), listOf(conflict, original))) {
            val result = runCatching {
                MyceliumStateDiagnostic.snapshot(context, packets.map { it.toEntity(1L) }).fingerprint()
            }
            assertTrue(result.exceptionOrNull() is IllegalArgumentException)
            assertEquals("Conflicting duplicate packet_id: ${original.packetId}", result.exceptionOrNull()?.message)
        }
    }

    @Test
    fun globalMeaningIdUtf16TieBreakAndSafetyMatchLedgerSemantics() = runTest {
        fixture.packets.forEachIndexed { index, packet ->
            repository.receivePacket(packet, receivedAt = 1_701_000_200L + index)
        }

        val snapshot = MyceliumStateSnapshot.fromState(
            repository.rebuildDerivedStateFromLedger()
        )

        assertEquals(listOf("phrase_𐀀", "phrase_"), snapshot.phrases.map { it.phraseId })

        val first = snapshot.phrases[0]
        val second = snapshot.phrases[1]
        assertEquals("meaning_𐀀", first.bestMeaningId)
        assertEquals(
            listOf("meaning_𐀀", "meaning_", "shared_global"),
            first.meanings.map { it.meaningId }
        )
        assertTrue(first.meanings.any { it.meaningId == "shared_global" })
        assertFalse(second.meanings.any { it.meaningId == "shared_global" })
        assertEquals("dangerous", second.safetyLabel)
        assertEquals("bay-ta", second.phoneticHint)
        assertNull(second.languageHint)

        val shared = first.meanings.single { it.meaningId == "shared_global" }
        assertEquals("first global owner", shared.referenceMeaning)
        assertEquals(1.0, shared.confirms, 0.0)
    }

    @Test
    fun uniqueVoterKeyKeepsExistingAndroidUnescapedCollisionSemantics() {
        val counts = countUniqueVoterVotes(
            listOf(
                UniqueVoterVoteInput(
                    targetKey = "a\",\"b",
                    voterId = "c",
                    vote = "confirm",
                    createdAt = 1L,
                    packetId = "packet_a"
                ),
                UniqueVoterVoteInput(
                    targetKey = "a",
                    voterId = "b\",\"c",
                    vote = "reject",
                    createdAt = 2L,
                    packetId = "packet_b"
                )
            )
        )

        assertNull(counts["a\",\"b"])
        assertEquals(0.0, counts.getValue("a").confirmVotes, 0.0)
        assertEquals(1.0, counts.getValue("a").rejectVotes, 0.0)
    }

    private fun newDatabase(): DaoVibeDatabase =
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()

    private fun LmpPacket<PacketPayload>.toEntity(receivedAt: Long): PacketEntity {
        val packetSize = estimatePacketSize(this)
        val payloadMap = payload.toStableMap()

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
            packetSizeBytes = packetSize.bytes,
            packetSizeClass = packetSize.sizeClass.wireValue,
            sizeRecommendation = packetSize.recommendation,
            createdAt = createdAt,
            receivedAt = receivedAt
        )
    }
}

private data class ConvergenceFixture(
    val expectedSnapshotCanonicalJson: String,
    val packets: List<LmpPacket<PacketPayload>>
) {
    companion object {
        fun load(): ConvergenceFixture {
            val json = ConvergenceFixture::class.java.classLoader
                ?.getResource("fixtures/mycelium_state_convergence.json")
                ?.readText()
                ?: error("Missing Mycelium convergence fixture")
            val root = JSONObject(json)
            val packetArray = root.getJSONArray("packets")

            return ConvergenceFixture(
                expectedSnapshotCanonicalJson = root.getString("expected_snapshot_canonical_json"),
                packets = (0 until packetArray.length()).map { index ->
                    PacketJsonCodec.decode(packetArray.getJSONObject(index))
                }
            )
        }
    }
}
