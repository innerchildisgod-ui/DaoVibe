package org.daovibe.android.core.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.mycelium.LEDGER_IMPORT_MAX_BYTES
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.mycelium.PacketReceiveDecision
import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.MeaningProposalPayload
import org.daovibe.android.core.protocol.MeaningVotePayload
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PhraseObservedPayload
import org.daovibe.android.core.protocol.VoteValue
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
class RoomLedgerTest {
    private lateinit var database: DaoVibeDatabase
    private lateinit var repository: LocalMyceliumRepository

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()
        repository = LocalMyceliumRepository(
            database = database,
            nowSeconds = { 1_700_000_100L }
        )
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun duplicatePacketsAreNotInsertedTwice() = runTest {
        val packet = observedPacket(createdAt = 1_700_000_000L)

        val first = repository.receivePacket(packet, receivedAt = 1_700_000_100L)
        val second = repository.receivePacket(packet, receivedAt = 1_700_000_101L)

        assertEquals(PacketReceiveDecision.ACCEPTED_NEW, first.decision)
        assertEquals(PacketReceiveDecision.ALREADY_STORED, second.decision)
        assertEquals(1, database.daoVibeDao().listPacketsInLedgerOrder().size)
    }

    @Test
    fun invalidPayloadHashIsRejectedBeforeInsert() = runTest {
        val invalid = observedPacket(createdAt = 1_700_000_000L)
            .copy(payloadHash = "not_a_valid_payload_hash")

        val result = repository.receivePacket(invalid, receivedAt = 1_700_000_100L)

        assertEquals(PacketReceiveDecision.REJECTED_INVALID, result.decision)
        assertTrue(result.errors.contains("Invalid payload_hash"))
        assertEquals(0, database.daoVibeDao().listPacketsInLedgerOrder().size)
    }

    @Test
    fun expiredPacketsAreRejectedBeforeInsert() = runTest {
        val packet = observedPacket(
            createdAt = 1_700_000_000L,
            expiresAt = 1_700_000_099L
        )

        val result = repository.receivePacket(packet, receivedAt = 1_700_000_100L)

        assertEquals(PacketReceiveDecision.REJECTED_EXPIRED, result.decision)
        assertEquals(0, database.daoVibeDao().listPacketsInLedgerOrder().size)
    }

    @Test
    fun acceptedPacketsDerivePhraseStateFromRoomRows() = runTest {
        val result = repository.receivePacket(
            observedPacket(createdAt = 1_700_000_000L),
            receivedAt = 1_700_000_100L
        )
        val snapshot = repository.observeSnapshot().first()

        assertEquals(PacketReceiveDecision.ACCEPTED_NEW, result.decision)
        assertEquals(1, snapshot.recentPackets.size)
        assertEquals(1, snapshot.ledgerPackets.size)
        assertEquals("phrase_room", snapshot.state.phrases.first().phraseId)
        assertEquals("Room phrase", snapshot.state.phrases.first().surfaceText)
    }

    @Test
    fun snapshotExposesPacketsInLedgerOrder() = runTest {
        val laterReceived = observedPacket(
            phraseId = "phrase_later",
            surfaceText = "Later received",
            createdAt = 1_700_000_000L
        )
        val earlierReceived = observedPacket(
            phraseId = "phrase_earlier",
            surfaceText = "Earlier received",
            createdAt = 1_700_000_001L
        )

        repository.receivePacket(laterReceived, receivedAt = 1_700_000_200L)
        repository.receivePacket(earlierReceived, receivedAt = 1_700_000_100L)
        val snapshot = repository.observeSnapshot().first()

        assertEquals(
            listOf(earlierReceived.packetId, laterReceived.packetId),
            snapshot.ledgerPackets.map { it.packetId }
        )
    }

    @Test
    fun deviceIdentityPersistsNodeIdAcrossDisplayNameChanges() = runTest {
        val original = repository.identityRepository.getOrCreate()
        val updated = repository.identityRepository.updateDisplayName("Pocket Node")

        assertEquals(original.nodeId, updated.nodeId)
        assertEquals(original.createdAt, updated.createdAt)
        assertEquals("Pocket Node", updated.displayName)
    }

    @Test
    fun nodeIdIsCreatedOnce() = runTest {
        val first = repository.identityRepository.getOrCreate()
        val second = repository.identityRepository.getOrCreate()

        assertEquals(first.nodeId, second.nodeId)
        assertEquals(first.createdAt, second.createdAt)
    }

    @Test
    fun nodeIdPersistsAcrossRepositoryRecreation() = runTest {
        val original = repository.identityRepository.getOrCreate()
        val recreatedRepository = LocalMyceliumRepository(
            database = database,
            nowSeconds = { 1_700_000_200L }
        )
        val recreated = recreatedRepository.identityRepository.getOrCreate()

        assertEquals(original.nodeId, recreated.nodeId)
        assertEquals(original.createdAt, recreated.createdAt)
    }

    @Test
    fun existingIdentityIsReusedWithDisplayName() = runTest {
        val original = repository.identityRepository.updateDisplayName("Balaji's Poco")
        val recreatedRepository = LocalMyceliumRepository(
            database = database,
            nowSeconds = { 1_700_000_200L }
        )
        val reused = recreatedRepository.identityRepository.getOrCreate()

        assertEquals(original.nodeId, reused.nodeId)
        assertEquals("Balaji's Poco", reused.displayName)
    }

    @Test
    fun localMyceliumPacketsUseImmutableNodeIdAsAuthor() = runTest {
        val identity = repository.identityRepository.getOrCreate()

        repository.observePhrase("Packet authorship phrase")
        val phrase = repository.observeSnapshot().first()
            .state
            .phrases
            .first { it.surfaceText == "Packet authorship phrase" }

        repository.proposeMeaning(
            phraseId = phrase.phraseId,
            referenceMeaning = "A phrase used to test packet authorship"
        )
        val meaning = repository.observeSnapshot().first()
            .state
            .findPhrase(phrase.phraseId)!!
            .meanings
            .first()

        repository.voteMeaning(
            phraseId = phrase.phraseId,
            meaningId = meaning.meaningId,
            vote = VoteValue.CONFIRM
        )
        repository.identityRepository.updateDisplayName("Renamed Local Node")

        val packets = database.daoVibeDao().listPacketsInLedgerOrder()
        assertEquals(
            setOf(
                PacketType.PHRASE_OBSERVED.wireValue,
                PacketType.MEANING_PROPOSAL.wireValue,
                PacketType.MEANING_VOTE.wireValue
            ),
            packets.map { it.packetType }.toSet()
        )
        assertEquals(3, packets.size)
        assertTrue(packets.all { it.author == identity.nodeId })
        assertTrue(
            packets.all { packet ->
                PacketJsonCodec.decode(packet.packetJson).author == identity.nodeId
            }
        )
    }

    @Test
    fun ledgerExportImportRoundTripIsDeterministic() = runTest {
        repository.observePhrase("Portable meaning")

        val sourcePhrase = repository.observeSnapshot()
            .first()
            .state
            .phrases
            .first { it.surfaceText == "Portable meaning" }

        repository.proposeMeaning(
            phraseId = sourcePhrase.phraseId,
            referenceMeaning = "A meaning that can move between DAOVibe nodes"
        )

        val sourceMeaning = repository.observeSnapshot()
            .first()
            .state
            .findPhrase(sourcePhrase.phraseId)!!
            .meanings
            .first()

        repository.voteMeaning(
            phraseId = sourcePhrase.phraseId,
            meaningId = sourceMeaning.meaningId,
            vote = VoteValue.CONFIRM
        )

        val exported = repository.exportLedgerJson()

        val importedDatabase = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()
        val secondImportedDatabase = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()

        try {
            val importedRepository = LocalMyceliumRepository(
                database = importedDatabase,
                nowSeconds = { 1_700_000_200L }
            )
            val secondImportedRepository = LocalMyceliumRepository(
                database = secondImportedDatabase,
                nowSeconds = { 1_700_000_200L }
            )

            val result = importedRepository.importLedgerJson(
                json = exported,
                importedAt = 1_700_000_200L
            )
            secondImportedRepository.importLedgerJson(
                json = exported,
                importedAt = 1_700_000_200L
            )

            assertEquals(3, result.totalPackets)
            assertEquals(3, result.insertedPackets)
            assertEquals(0, result.duplicatePackets)

            val reExported = importedRepository.exportLedgerJson()

            assertEquals(exported, reExported)

            assertEquals(
                database.daoVibeDao()
                    .listPacketsForReplay()
                    .map { it.packetId },
                importedDatabase.daoVibeDao()
                    .listPacketsForReplay()
                    .map { it.packetId }
            )

            val importedSnapshot = importedRepository.observeSnapshot().first()

            assertEquals(1, importedSnapshot.state.phrases.size)
            assertEquals(
                "Portable meaning",
                importedSnapshot.state.phrases.first().surfaceText
            )
            assertEquals(
                "A meaning that can move between DAOVibe nodes",
                importedSnapshot.state.phrases
                    .first()
                    .meanings
                    .first()
                    .referenceMeaning
            )
            assertEquals(
                importedSnapshot.state,
                secondImportedRepository.observeSnapshot().first().state
            )
        } finally {
            importedDatabase.close()
            secondImportedDatabase.close()
        }
    }

    @Test
    fun invalidLedgerImportWritesNothing() = runTest {
        val goodPacket = observedPacket(
            createdAt = 1_700_000_000L,
            phraseId = "phrase_good",
            surfaceText = "Good packet"
        )

        val invalidPacket = observedPacket(
            createdAt = 1_700_000_001L,
            phraseId = "phrase_invalid",
            surfaceText = "Invalid packet"
        ).copy(
            payloadHash = "invalid_payload_hash"
        )

        val json =
            "{\"format\":\"daovibe-ledger-v1\",\"packets\":[" +
                PacketJsonCodec.encode(goodPacket) +
                "," +
                PacketJsonCodec.encode(invalidPacket) +
                "]}"

        val result = runCatching {
            repository.importLedgerJson(
                json = json,
                importedAt = 1_700_000_100L
            )
        }

        assertTrue(result.isFailure)
        assertEquals(
            0,
            database.daoVibeDao().listPacketsInLedgerOrder().size
        )
        assertEquals(
            0,
            database.daoVibeDao().listPhrases().size
        )
    }

    @Test
    fun importingExistingPacketsDoesNotDuplicateLedgerRows() = runTest {
        val packet = observedPacket(
            createdAt = 1_700_000_000L
        )

        repository.receivePacket(
            packet = packet,
            receivedAt = 1_700_000_100L
        )

        val exported = repository.exportLedgerJson()

        val result = repository.importLedgerJson(
            json = exported,
            importedAt = 1_700_000_200L
        )

        assertEquals(1, result.totalPackets)
        assertEquals(0, result.insertedPackets)
        assertEquals(1, result.duplicatePackets)
        assertEquals(
            1,
            database.daoVibeDao().listPacketsInLedgerOrder().size
        )
    }

    @Test
    fun expiredLedgerImportWritesNothing() = runTest {
        val validPacket = observedPacket(
            createdAt = 1_700_000_000L,
            phraseId = "phrase_valid",
            surfaceText = "Valid packet"
        )

        val expiredPacket = observedPacket(
            createdAt = 1_700_000_001L,
            expiresAt = 1_700_000_099L,
            phraseId = "phrase_expired",
            surfaceText = "Expired packet"
        )

        val json =
            "{\"format\":\"daovibe-ledger-v1\",\"packets\":[" +
                PacketJsonCodec.encode(validPacket) +
                "," +
                PacketJsonCodec.encode(expiredPacket) +
                "]}"

        val result = runCatching {
            repository.importLedgerJson(
                json = json,
                importedAt = 1_700_000_100L
            )
        }

        assertTrue(result.isFailure)
        assertEquals(
            0,
            database.daoVibeDao().listPacketsInLedgerOrder().size
        )
        assertEquals(
            0,
            database.daoVibeDao().listPhrases().size
        )
    }

    @Test
    fun oversizedLedgerImportIsRejectedBeforeParsingOrWrites() = runTest {
        val result = runCatching {
            repository.importLedgerJson(
                json = "x".repeat(LEDGER_IMPORT_MAX_BYTES + 1),
                importedAt = 1_700_000_100L
            )
        }

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("too large") == true)
        assertEquals(0, database.daoVibeDao().listPacketsInLedgerOrder().size)
    }

    @Test
    fun conflictingDuplicatePacketIdIsRejectedBeforeWrites() = runTest {
        val packet = observedPacket(createdAt = 1_700_000_000L)
        val conflictingPacket = packet.copy(signature = "different-signature")

        val result = runCatching {
            repository.importLedgerJson(
                json = ledgerJson(packet, conflictingPacket),
                importedAt = 1_700_000_100L
            )
        }

        assertTrue(result.isFailure)
        assertTrue(
            result.exceptionOrNull()?.message?.contains("Conflicting duplicate packet_id") == true
        )
        assertEquals(0, database.daoVibeDao().listPacketsInLedgerOrder().size)
        assertEquals(0, database.daoVibeDao().listPhrases().size)
    }

    @Test
    fun conflictingDuplicatePacketIdAgainstExistingLedgerIsRejected() = runTest {
        val packet = observedPacket(createdAt = 1_700_000_000L)
        repository.receivePacket(packet, receivedAt = 1_700_000_100L)

        val result = runCatching {
            repository.importLedgerJson(
                json = ledgerJson(packet.copy(signature = "different-signature")),
                importedAt = 1_700_000_100L
            )
        }

        assertTrue(result.isFailure)
        assertEquals(1, database.daoVibeDao().listPacketsInLedgerOrder().size)
        assertEquals(
            PacketJsonCodec.encode(packet),
            database.daoVibeDao().listPacketsInLedgerOrder().single().packetJson
        )
    }

    @Test
    fun dependencyOutOfOrderReplayReconstructsState() = runTest {
        val packets = sameTimestampCausalPacketsWithDependencyFirst()
        val replayOrder = packets.sortedWith(
            compareBy<LmpPacket<PacketPayload>>(
                { it.createdAt },
                { it.packetId }
            )
        )
        val phrasePosition = replayOrder.indexOfFirst {
            it.packetType == PacketType.PHRASE_OBSERVED
        }
        val meaningPosition = replayOrder.indexOfFirst {
            it.packetType == PacketType.MEANING_PROPOSAL
        }
        val votePosition = replayOrder.indexOfFirst {
            it.packetType == PacketType.MEANING_VOTE
        }

        assertTrue(
            phrasePosition > meaningPosition || meaningPosition > votePosition
        )

        val result = repository.importLedgerJson(
            json = ledgerJson(*packets.toTypedArray()),
            importedAt = 1_700_000_100L
        )
        val phrase = repository.observeSnapshot().first().state.findPhrase("phrase_dependency")

        assertEquals(3, result.insertedPackets)
        assertEquals(1, phrase?.meanings?.size)
        assertEquals(1.0, phrase?.meanings?.first()?.confirms ?: 0.0, 0.0)
    }

    @Test
    fun unresolvedDependencyRollsBackEntireImport() = runTest {
        repository.receivePacket(
            packet = observedPacket(
                createdAt = 1_700_000_000L,
                phraseId = "phrase_existing",
                surfaceText = "Existing phrase"
            ),
            receivedAt = 1_700_000_100L
        )

        val importedPhrase = observedPacket(
            createdAt = 1_700_000_001L,
            phraseId = "phrase_imported",
            surfaceText = "Imported phrase"
        )
        val unresolvedProposal = meaningProposalPacket(
            phraseId = "phrase_missing",
            meaningId = "meaning_missing",
            createdAt = 1_700_000_002L
        )

        val result = runCatching {
            repository.importLedgerJson(
                json = ledgerJson(importedPhrase, unresolvedProposal),
                importedAt = 1_700_000_100L
            )
        }

        assertTrue(result.isFailure)
        assertEquals(
            listOf(observedPacket(
                createdAt = 1_700_000_000L,
                phraseId = "phrase_existing",
                surfaceText = "Existing phrase"
            ).packetId),
            database.daoVibeDao().listPacketsInLedgerOrder().map { it.packetId }
        )
        assertEquals(
            listOf("phrase_existing"),
            database.daoVibeDao().listPhrases().map { it.phraseId }
        )
        assertEquals(0, database.daoVibeDao().listMeanings().size)
    }

    @Test
    fun importedPacketsPreserveOriginalAuthor() = runTest {
        val importedPacket = observedPacket(
            createdAt = 1_700_000_000L,
            author = "remote_node_original"
        )

        repository.importLedgerJson(
            json = ledgerJson(importedPacket),
            importedAt = 1_700_000_100L
        )

        val storedPacket = database.daoVibeDao().listPacketsInLedgerOrder().single()
        assertEquals("remote_node_original", storedPacket.author)
        assertEquals(
            "remote_node_original",
            PacketJsonCodec.decode(storedPacket.packetJson).author
        )
    }

    @Test
    fun ledgerImportDoesNotReplaceLocalDeviceIdentity() = runTest {
        val beforeImport = repository.identityRepository.updateDisplayName("Local Node")
        val importedPacket = observedPacket(
            createdAt = 1_700_000_000L,
            author = "another_device_node"
        )

        repository.importLedgerJson(
            json = ledgerJson(importedPacket),
            importedAt = 1_700_000_100L
        )

        val afterImport = repository.identityRepository.getOrCreate()
        assertEquals(beforeImport.nodeId, afterImport.nodeId)
        assertEquals(beforeImport.displayName, afterImport.displayName)
        assertEquals(beforeImport.createdAt, afterImport.createdAt)
    }

    private fun observedPacket(
        createdAt: Long,
        expiresAt: Long? = null,
        phraseId: String = "phrase_room",
        surfaceText: String = "Room phrase",
        author: String = "author_a"
    ) = PacketFactory { createdAt }.create(
        packetType = PacketType.PHRASE_OBSERVED,
        zone = "test_zone",
        author = author,
        payload = PhraseObservedPayload(
            phraseId = phraseId,
            surfaceText = surfaceText,
            languageHint = "en",
            inputType = InputType.TEXT
        ),
        expiresAt = expiresAt,
        createdAt = createdAt
    )

    private fun meaningProposalPacket(
        phraseId: String,
        meaningId: String,
        createdAt: Long
    ): LmpPacket<PacketPayload> = PacketFactory { createdAt }.create(
        packetType = PacketType.MEANING_PROPOSAL,
        zone = "test_zone",
        author = "meaning_author",
        payload = MeaningProposalPayload(
            phraseId = phraseId,
            meaningId = meaningId,
            referenceMeaning = "A dependency-aware meaning",
            confidence = 0.25
        ),
        createdAt = createdAt
    )

    private fun meaningVotePacket(
        phraseId: String,
        meaningId: String,
        createdAt: Long
    ): LmpPacket<PacketPayload> = PacketFactory { createdAt }.create(
        packetType = PacketType.MEANING_VOTE,
        zone = "test_zone",
        author = "vote_author",
        payload = MeaningVotePayload(
            phraseId = phraseId,
            meaningId = meaningId,
            vote = VoteValue.CONFIRM,
            confidence = 1.0
        ),
        createdAt = createdAt
    )

    private fun sameTimestampCausalPacketsWithDependencyFirst():
        List<LmpPacket<PacketPayload>> {
        for (index in 0 until 10_000) {
            val phraseId = "phrase_dependency"
            val meaningId = "meaning_dependency_$index"
            val phrase = observedPacket(
                createdAt = 1_700_000_000L,
                phraseId = phraseId,
                surfaceText = "Dependency phrase $index"
            )
            val meaning = meaningProposalPacket(
                phraseId = phraseId,
                meaningId = meaningId,
                createdAt = phrase.createdAt
            )
            val vote = meaningVotePacket(
                phraseId = phraseId,
                meaningId = meaningId,
                createdAt = phrase.createdAt
            )
            val packets = listOf<LmpPacket<PacketPayload>>(phrase, meaning, vote)
            val ordered = packets.sortedWith(
                compareBy<LmpPacket<PacketPayload>>(
                    { it.createdAt },
                    { it.packetId }
                )
            )
            val phrasePosition = ordered.indexOfFirst {
                it.packetType == PacketType.PHRASE_OBSERVED
            }
            val meaningPosition = ordered.indexOfFirst {
                it.packetType == PacketType.MEANING_PROPOSAL
            }
            val votePosition = ordered.indexOfFirst {
                it.packetType == PacketType.MEANING_VOTE
            }

            if (phrasePosition > meaningPosition || meaningPosition > votePosition) {
                return packets
            }
        }

        error("Could not construct dependency-first replay order")
    }

    private fun ledgerJson(
        vararg packets: LmpPacket<PacketPayload>
    ): String =
        "{\"format\":\"daovibe-ledger-v1\",\"packets\":[" +
            packets.joinToString(",") { PacketJsonCodec.encode(it) } +
            "]}"
}
