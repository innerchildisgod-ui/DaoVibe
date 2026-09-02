package org.daovibe.android.core.mycelium

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.StableJson
import org.daovibe.android.core.protocol.estimatePacketSize
import org.daovibe.android.core.protocol.sha256
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.PacketEntity
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class TypeScriptFixtureReplayTest {
    private lateinit var database: DaoVibeDatabase
    private lateinit var repository: LocalMyceliumRepository
    private lateinit var fixture: TypeScriptLanguageFixture

    @Before
    fun setUp() {
        database = newDatabase()
        repository = LocalMyceliumRepository(
            database = database,
            nowSeconds = { 1_700_000_200L }
        )
        fixture = TypeScriptLanguageFixture.load()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun fixtureCanonicalJsonMatchesKotlinCanonicalization() {
        fixture.entries.forEach { entry ->
            assertEquals(
                entry.payloadCanonicalJson,
                StableJson.stringify(entry.packet.payload.toStableMap())
            )
            assertEquals(
                entry.packetHashInputCanonicalJson,
                StableJson.stringify(entry.packet.hashInputMap())
            )
            assertEquals(
                entry.packetCanonicalJson,
                StableJson.stringify(entry.packet.toStableMap())
            )
        }
    }

    @Test
    fun fixturePayloadAndPacketHashesMatchKotlin() {
        fixture.entries.forEach { entry ->
            assertEquals(entry.payloadHash, sha256(entry.payloadCanonicalJson))
            assertEquals(entry.payloadHash, entry.packet.payloadHash)
            assertEquals(entry.packetId, sha256(entry.packetHashInputCanonicalJson))
            assertEquals(entry.packetId, entry.packet.packetId)
            assertEquals(entry.signatureInputHash, sha256(StableJson.stringify(entry.packet.signatureInputMap())))
        }
    }

    @Test
    fun importsTypeScriptFixturePacketsSuccessfully() = runTest {
        val results = importFixturePackets(repository, fixture)

        assertEquals(fixture.expected.ledgerCount, results.size)
        results.forEach { result ->
            assertEquals(PacketReceiveDecision.ACCEPTED_NEW, result.decision)
        }
        assertEquals(fixture.expected.ledgerCount, database.daoVibeDao().listPacketsInLedgerOrder().size)
    }

    @Test
    fun rebuildFromLedgerProducesExpectedPhraseAndMeaningState() = runTest {
        importFixturePackets(repository, fixture)

        val state = repository.rebuildDerivedStateFromLedger()

        assertExpectedState(fixture.expected, state)
    }

    @Test
    fun confirmRejectUnsureAndLatestUniqueVoterBehaviorSurviveReplay() = runTest {
        importFixturePackets(repository, fixture)

        val best = repository.rebuildDerivedStateFromLedger()
            .bestMeaning(fixture.expected.phraseId)

        assertEquals(fixture.expected.confidence, best?.confidence ?: -1.0, 0.0)
        assertEquals(fixture.expected.confirmVotes, best?.confirms ?: -1.0, 0.0)
        assertEquals(fixture.expected.rejectVotes, best?.rejects ?: -1.0, 0.0)
        assertEquals(fixture.expected.totalVotes, best?.totalVotes ?: -1.0, 0.0)
        assertEquals(fixture.expected.score, best?.score ?: -1.0, 0.0)
    }

    @Test
    fun runningRebuildTwiceProducesIdenticalState() = runTest {
        importFixturePackets(repository, fixture)

        val first = repository.rebuildDerivedStateFromLedger()
        val second = repository.rebuildDerivedStateFromLedger()

        assertEquals(first, second)
    }

    @Test
    fun clearingDerivedStateAndRebuildingRestoresItFromLedger() = runTest {
        importFixturePackets(repository, fixture)
        val expectedState = repository.rebuildDerivedStateFromLedger()

        database.daoVibeDao().clearVotes()
        database.daoVibeDao().clearMeanings()
        database.daoVibeDao().clearPhrases()
        assertEquals(0, database.daoVibeDao().listPhrases().size)
        assertEquals(fixture.expected.ledgerCount, database.daoVibeDao().listPacketsInLedgerOrder().size)

        val rebuiltState = repository.rebuildDerivedStateFromLedger()

        assertEquals(expectedState, rebuiltState)
        assertExpectedState(fixture.expected, rebuiltState)
    }

    @Test
    fun twoIndependentDatabasesWithSameFixtureDeriveEqualState() = runTest {
        val otherDatabase = newDatabase()
        val otherRepository = LocalMyceliumRepository(
            database = otherDatabase,
            nowSeconds = { 1_700_000_200L }
        )

        try {
            importFixturePackets(repository, fixture)
            importFixturePackets(otherRepository, fixture)

            assertEquals(
                repository.rebuildDerivedStateFromLedger(),
                otherRepository.rebuildDerivedStateFromLedger()
            )
        } finally {
            otherDatabase.close()
        }
    }

    @Test
    fun packetInsertionOrderDoesNotChangeFixtureReplayState() = runTest {
        importFixturePackets(repository, fixture)
        val expectedState = repository.rebuildDerivedStateFromLedger()

        val reversedDatabase = newDatabase()
        val reversedRepository = LocalMyceliumRepository(
            database = reversedDatabase,
            nowSeconds = { 1_700_000_200L }
        )

        try {
            fixture.packets.reversed().forEachIndexed { index, packet ->
                reversedDatabase.daoVibeDao().insertPacket(
                    packet.toEntity(receivedAt = 1_700_000_300L + index)
                )
            }

            assertEquals(expectedState, reversedRepository.rebuildDerivedStateFromLedger())
        } finally {
            reversedDatabase.close()
        }
    }

    private fun newDatabase(): DaoVibeDatabase =
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()

    private suspend fun importFixturePackets(
        repository: LocalMyceliumRepository,
        fixture: TypeScriptLanguageFixture
    ): List<PacketReceiveResult> =
        fixture.packets.mapIndexed { index, packet ->
            repository.receivePacket(packet, receivedAt = 1_700_000_200L + index)
        }

    private fun assertExpectedState(
        expected: ExpectedFixtureState,
        state: MyceliumState
    ) {
        assertEquals(expected.phraseCount, state.phrases.size)

        val phrase = state.findPhrase(expected.phraseId)
            ?: error("Missing phrase ${expected.phraseId}")
        assertEquals(expected.surfaceText, phrase.surfaceText)
        assertEquals(expected.phoneticHint, phrase.phoneticHint)
        assertEquals(expected.languageHint, phrase.languageHint)
        assertEquals(expected.safetyLabel, phrase.safetyLabel)
        assertEquals(expected.meaningCount, phrase.meanings.size)

        val meaning = phrase.meanings.first()
        assertEquals(expected.meaningId, meaning.meaningId)
        assertEquals(expected.referenceMeaning, meaning.referenceMeaning)
        assertEquals(expected.context, meaning.context)
        assertEquals(expected.confidence, meaning.confidence, 0.0)
        assertEquals(expected.confirmVotes, meaning.confirms, 0.0)
        assertEquals(expected.rejectVotes, meaning.rejects, 0.0)
        assertEquals(expected.totalVotes, meaning.totalVotes, 0.0)
        assertEquals(expected.score, meaning.score, 0.0)
    }

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

private data class TypeScriptLanguageFixture(
    val expected: ExpectedFixtureState,
    val entries: List<TypeScriptPacketFixtureEntry>
) {
    val packets: List<LmpPacket<PacketPayload>> = entries.map { it.packet }

    companion object {
        fun load(): TypeScriptLanguageFixture {
            val json = TypeScriptLanguageFixture::class.java.classLoader
                ?.getResource("fixtures/typescript_language_packets.json")
                ?.readText()
                ?: error("Missing TypeScript language fixture")
            val root = JSONObject(json)
            val expected = root.getJSONObject("expected")
            val packets = root.getJSONArray("packets")

            return TypeScriptLanguageFixture(
                expected = ExpectedFixtureState(
                    phraseId = expected.getString("phrase_id"),
                    surfaceText = expected.getString("surface_text"),
                    phoneticHint = expected.getString("phonetic_hint"),
                    languageHint = expected.getString("language_hint"),
                    safetyLabel = expected.getString("safety_label"),
                    meaningId = expected.getString("meaning_id"),
                    referenceMeaning = expected.getString("reference_meaning"),
                    context = expected.getString("context"),
                    confidence = expected.getDouble("confidence"),
                    confirmVotes = expected.getDouble("confirm_votes"),
                    rejectVotes = expected.getDouble("reject_votes"),
                    score = expected.getDouble("score"),
                    totalVotes = expected.getDouble("total_votes"),
                    phraseCount = expected.getInt("phrase_count"),
                    meaningCount = expected.getInt("meaning_count"),
                    ledgerCount = expected.getInt("ledger_count")
                ),
                entries = (0 until packets.length()).map { index ->
                    val entry = packets.getJSONObject(index)
                    TypeScriptPacketFixtureEntry(
                        name = entry.getString("name"),
                        payloadCanonicalJson = entry.getString("payload_canonical_json"),
                        payloadHash = entry.getString("payload_hash"),
                        packetHashInputCanonicalJson = entry.getString("packet_hash_input_canonical_json"),
                        packetId = entry.getString("packet_id"),
                        packetCanonicalJson = entry.getString("packet_canonical_json"),
                        signatureInputHash = entry.getString("signature_input_hash"),
                        packet = PacketJsonCodec.decode(entry.getJSONObject("packet"))
                    )
                }
            )
        }
    }
}

private data class TypeScriptPacketFixtureEntry(
    val name: String,
    val payloadCanonicalJson: String,
    val payloadHash: String,
    val packetHashInputCanonicalJson: String,
    val packetId: String,
    val packetCanonicalJson: String,
    val signatureInputHash: String,
    val packet: LmpPacket<PacketPayload>
)

private data class ExpectedFixtureState(
    val phraseId: String,
    val surfaceText: String,
    val phoneticHint: String,
    val languageHint: String,
    val safetyLabel: String,
    val meaningId: String,
    val referenceMeaning: String,
    val context: String,
    val confidence: Double,
    val confirmVotes: Double,
    val rejectVotes: Double,
    val score: Double,
    val totalVotes: Double,
    val phraseCount: Int,
    val meaningCount: Int,
    val ledgerCount: Int
)

