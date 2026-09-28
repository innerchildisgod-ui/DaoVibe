package org.daovibe.android.core.mycelium

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.protocol.CorrectionProposedPayload
import org.daovibe.android.core.protocol.CorrectionVotePayload
import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.VoteValue
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
class MyceliumStateCorrectionTest {
    private lateinit var database: DaoVibeDatabase
    private lateinit var repository: LocalMyceliumRepository
    private lateinit var fixture: CorrectionFixture

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(), DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()
        repository = LocalMyceliumRepository(database, nowSeconds = { 1_701_200_000L })
        fixture = CorrectionFixture.load()
    }

    @After
    fun tearDown() = database.close()

    @Test
    fun sharedFixtureHasFixedCanonicalJsonBytesAndHash() = runTest {
        fixture.packets.forEachIndexed { index, packet ->
            assertEquals(
                PacketReceiveDecision.ACCEPTED_NEW,
                repository.receivePacket(packet, 1_701_200_000L + index).decision
            )
        }
        val snapshot = MyceliumStateSnapshot.fromState(repository.rebuildDerivedStateFromLedger())
        assertEquals(fixture.expectedJson, snapshot.toCanonicalJson())
        assertEquals(fixture.expectedByteLength, snapshot.toCanonicalJson().toByteArray(Charsets.UTF_8).size)
        assertEquals(fixture.expectedFingerprint, snapshot.fingerprint())
        val meaning = snapshot.phrases.single().meanings.single()
        assertEquals("correction_𐀀", meaning.effectiveCorrectionId)
        assertEquals("corrected null context", meaning.effectiveReferenceMeaning)
        assertNull(meaning.effectiveContext)
        assertEquals(listOf("correction_z", "correction_𐀀", "correction_"), meaning.corrections.map { it.correctionId })
        assertEquals(2.0, meaning.corrections[1].confirms, 0.0)
        assertEquals(1.0, meaning.corrections[0].rejects, 0.0)
    }

    @Test
    fun reverseOrderAndIdenticalDuplicatesHaveTheSameState() = runTest {
        val reversed = fixture.packets.reversed()
        reversed.forEachIndexed { index, packet ->
            database.daoVibeDao().insertPacket(packet.toEntity(1_701_200_100L + index))
        }
        val expected = MyceliumStateSnapshot.fromState(repository.rebuildDerivedStateFromLedger())
        val duplicated = MyceliumStateSnapshot.fromState(
            MyceliumReducer.reduce(fixture.packets + fixture.packets)
        )
        assertEquals(fixture.expectedJson, expected.toCanonicalJson())
        assertEquals(expected.toCanonicalJson(), duplicated.toCanonicalJson())
    }

    @Test
    fun correctionProposalAndVoteRequireExactParentsAndTargets() = runTest {
        val phrase = fixture.packets[0]
        val meaning = fixture.packets[1]
        val correction = fixture.packets[2]
        repository.receivePacket(phrase)
        repository.receivePacket(meaning)

        val factory = PacketFactory { 1_701_200_500L }
        val proposalPayload = correction.payload as CorrectionProposedPayload
        val wrongProposal = factory.create(
            PacketType.CORRECTION_PROPOSED,
            "fixture_zone",
            "attacker",
            proposalPayload,
            parent = phrase.packetId
        )
        assertEquals(PacketReceiveDecision.FAILED_APPLY, repository.receivePacket(wrongProposal).decision)

        val votePayload = fixture.packets[5].payload as CorrectionVotePayload
        val missingParent = factory.create(
            PacketType.CORRECTION_VOTE,
            "fixture_zone",
            "attacker",
            votePayload,
            parent = null
        )
        assertEquals(PacketReceiveDecision.FAILED_APPLY, repository.receivePacket(missingParent).decision)

        val wrongTarget = factory.create(
            PacketType.CORRECTION_VOTE,
            "fixture_zone",
            "attacker",
            votePayload.copy(phraseId = "another_phrase"),
            parent = correction.packetId
        )
        assertEquals(PacketReceiveDecision.FAILED_APPLY, repository.receivePacket(wrongTarget).decision)
    }

    @Test
    fun proposalAloneDoesNotReplaceOriginalAndExplicitNullIsNotOriginalFallback() = runTest {
        fixture.packets.take(3).forEach { repository.receivePacket(it) }
        var meaning = MyceliumStateSnapshot.fromState(repository.rebuildDerivedStateFromLedger()).phrases.single().meanings.single()
        assertNull(meaning.effectiveCorrectionId)
        assertEquals("original meaning", meaning.effectiveReferenceMeaning)
        assertEquals("original context", meaning.effectiveContext)

        fixture.packets.drop(5).take(4).forEach { repository.receivePacket(it) }
        meaning = MyceliumStateSnapshot.fromState(repository.rebuildDerivedStateFromLedger()).phrases.single().meanings.single()
        assertEquals("correction_𐀀", meaning.effectiveCorrectionId)
        assertNull(meaning.effectiveContext)
        assertFalse(meaning.referenceMeaning == meaning.effectiveReferenceMeaning)
    }

    @Test
    fun generatedCorrectionIdsIncludeProposalContext() = runTest {
        repository.receivePacket(fixture.packets[0])
        repository.receivePacket(fixture.packets[1])
        repository.proposeCorrection(
            "phrase_correction_unicode",
            "meaning_original",
            "same corrected text",
            context = null
        )
        repository.proposeCorrection(
            "phrase_correction_unicode",
            "meaning_original",
            "same corrected text",
            context = "different context"
        )
        val ids = database.daoVibeDao().listPacketsForReplay()
            .map { PacketJsonCodec.decode(it.packetJson).payload }
            .filterIsInstance<CorrectionProposedPayload>()
            .map { it.correctionId }
        assertEquals(2, ids.distinct().size)
    }

    private fun LmpPacket<PacketPayload>.toEntity(receivedAt: Long): PacketEntity {
        val size = estimatePacketSize(this)
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
            payloadJson = org.daovibe.android.core.protocol.StableJson.stringify(payloadMap),
            packetJson = PacketJsonCodec.encode(this),
            packetSizeBytes = size.bytes,
            packetSizeClass = size.sizeClass.wireValue,
            sizeRecommendation = size.recommendation,
            createdAt = createdAt,
            receivedAt = receivedAt
        )
    }
}

private data class CorrectionFixture(
    val packets: List<LmpPacket<PacketPayload>>,
    val expectedJson: String,
    val expectedByteLength: Int,
    val expectedFingerprint: String
) {
    companion object {
        fun load(): CorrectionFixture {
            val root = JSONObject(
                CorrectionFixture::class.java.classLoader
                    ?.getResource("fixtures/mycelium_state_correction.json")
                    ?.readText() ?: error("Missing correction fixture")
            )
            val packets = root.getJSONArray("packets").let { array ->
                (0 until array.length()).map { PacketJsonCodec.decode(array.getJSONObject(it)) }
            }
            return CorrectionFixture(
                packets = packets,
                expectedJson = root.getString("expected_snapshot_canonical_json"),
                expectedByteLength = root.getInt("expected_utf8_byte_length"),
                expectedFingerprint = root.getString("expected_fingerprint")
            )
        }
    }
}
