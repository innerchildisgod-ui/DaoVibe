package org.daovibe.android.core.sync

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.MeaningProposalPayload
import org.daovibe.android.core.protocol.MeaningVotePayload
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PhraseObservedPayload
import org.daovibe.android.core.protocol.VoteValue
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.DeviceIdentityEntity
import org.daovibe.android.core.storage.PairingRecordEntity
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class PacketSyncRepositoryTest {
    private lateinit var sourceDatabase: DaoVibeDatabase
    private lateinit var targetDatabase: DaoVibeDatabase
    private lateinit var sourceRepository: LocalMyceliumRepository
    private lateinit var targetRepository: LocalMyceliumRepository
    private lateinit var sourceSync: PacketSyncRepository
    private lateinit var targetSync: PacketSyncRepository

    @Before
    fun setUp() {
        sourceDatabase = newDatabase()
        targetDatabase = newDatabase()
        sourceRepository = LocalMyceliumRepository(
            database = sourceDatabase,
            nowSeconds = { NOW }
        )
        targetRepository = LocalMyceliumRepository(
            database = targetDatabase,
            nowSeconds = { NOW }
        )
        sourceSync = PacketSyncRepository(
            database = sourceDatabase,
            nowSeconds = { NOW }
        )
        targetSync = PacketSyncRepository(
            database = targetDatabase,
            nowSeconds = { NOW }
        )
        runBlocking {
            targetDatabase.daoVibeDao().insertDeviceIdentity(
                DeviceIdentityEntity(
                    id = 1,
                    nodeId = LOCAL_NODE,
                    displayName = "Local Node",
                    createdAt = CREATED_AT
                )
            )
        }
    }

    @After
    fun tearDown() {
        sourceDatabase.close()
        targetDatabase.close()
    }

    @Test
    fun defaultCursorReturnsEarliestPacketsInReceivedOrder() = runTest {
        val first = phrasePacket(1, createdAt = 30L)
        val second = phrasePacket(2, createdAt = 10L)
        val third = phrasePacket(3, createdAt = 20L)
        sourceRepository.receivePacket(first, receivedAt = 300L)
        sourceRepository.receivePacket(second, receivedAt = 100L)
        sourceRepository.receivePacket(third, receivedAt = 200L)

        val batch = sourceSync.exportWindow(request())

        assertEquals(
            listOf(second.packetId, third.packetId, first.packetId),
            batch.packets.map { it.packetId }
        )
        assertEquals(
            SyncProtocol.cursorFor(300L, first.packetId),
            batch.nextCursor
        )
        assertFalse(batch.hasMore)
    }

    @Test
    fun cursorExcludesAlreadyExportedRowsIncludingSameTimestampTies() = runTest {
        val first = phrasePacket(1)
        val second = phrasePacket(2)
        val ordered = listOf(first, second).sortedBy { it.packetId }
        ordered.forEach { packet ->
            sourceRepository.receivePacket(packet, receivedAt = 200L)
        }

        val batch = sourceSync.exportWindow(
            request(
                cursor = SyncProtocol.cursorFor(
                    receivedAt = 200L,
                    packetId = ordered.first().packetId
                )
            )
        )

        assertEquals(
            listOf(ordered.last().packetId),
            batch.packets.map { it.packetId }
        )
    }

    @Test
    fun packetOrderingUsesReceivedAtThenPacketIdNotCreatedAt() = runTest {
        val first = phrasePacket(1, createdAt = 900L)
        val second = phrasePacket(2, createdAt = 100L)
        sourceRepository.receivePacket(first, receivedAt = 100L)
        sourceRepository.receivePacket(second, receivedAt = 200L)

        val batch = sourceSync.exportWindow(request())

        assertEquals(
            listOf(first.packetId, second.packetId),
            batch.packets.map { it.packetId }
        )
    }

    @Test
    fun requestedLimitCannotReturnMoreThanFiftyPackets() = runTest {
        repeat(MAX_PACKETS_PER_SYNC_BATCH + 5) { index ->
            sourceRepository.receivePacket(
                packet = phrasePacket(index),
                receivedAt = 100L + index
            )
        }

        val batch = sourceSync.exportWindow(request(limit = 500))

        assertEquals(MAX_PACKETS_PER_SYNC_BATCH, batch.packets.size)
        assertTrue(batch.hasMore)
        assertTrue(
            SyncProtocol.encodedByteSize(batch) <= MAX_SYNC_BATCH_BYTES
        )
    }

    @Test
    fun byteLimitStopsBeforeOversizedSerializedBatch() = runTest {
        repeat(30) { index ->
            sourceRepository.receivePacket(
                packet = phrasePacket(
                    index = index,
                    surfaceText = "x".repeat(3_000) + index
                ),
                receivedAt = 100L + index
            )
        }

        val batch = sourceSync.exportWindow(request(limit = 50))

        assertTrue(batch.packets.size < 30)
        assertTrue(batch.hasMore)
        assertTrue(
            SyncProtocol.encodedByteSize(batch) <= MAX_SYNC_BATCH_BYTES
        )
    }

    @Test
    fun individualPacketThatCannotFitProducesStructuredFailure() = runTest {
        sourceRepository.receivePacket(
            packet = phrasePacket(
                index = 1,
                surfaceText = "x".repeat(MAX_SYNC_BATCH_BYTES)
            ),
            receivedAt = 100L
        )

        val error = runCatching {
            sourceSync.exportWindow(request())
        }.exceptionOrNull()

        assertTrue(error is SyncProtocolException)
        assertEquals(
            SyncRejectReason.PACKET_TOO_LARGE,
            (error as SyncProtocolException).reason
        )
    }

    @Test
    fun successfulImportStoresCursorAndRebuildsDerivedState() = runTest {
        val packet = phrasePacket(1)
        sourceRepository.receivePacket(packet, receivedAt = 100L)
        val batch = sourceSync.exportWindow(request())

        val result = targetSync.importBatch(
            batch = batch,
            remoteNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            importedAt = NOW
        )

        assertEquals(1, result.insertedPackets)
        assertEquals(0, result.duplicatePackets)
        assertEquals(batch.nextCursor, result.cursorAfter)
        assertEquals(
            batch.nextCursor,
            targetDatabase.daoVibeDao()
                .getPeerSyncState(REMOTE_NODE)
                ?.inboundCursor
        )
        assertEquals(
            1,
            targetRepository.observeSnapshot().first().state.phrases.size
        )
    }

    @Test
    fun localNodeTargetMismatchRejectsBeforeAnyImportWrite() = runTest {
        val packet = phrasePacket(1)
        val batch = SyncBatch(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = SESSION_ID,
            sourceNodeId = REMOTE_NODE,
            targetNodeId = "mycelium_node_other",
            pairingId = PAIRING_ID,
            requestCursor = START_SYNC_CURSOR,
            nextCursor = SyncProtocol.cursorFor(100L, packet.packetId),
            hasMore = false,
            packets = listOf(packet)
        )

        val error = runCatching {
            targetSync.importBatch(
                batch = batch,
                remoteNodeId = REMOTE_NODE,
                pairingId = PAIRING_ID,
                importedAt = NOW
            )
        }.exceptionOrNull()

        assertTrue(error is SyncImportException)
        assertEquals(
            SyncRejectReason.TARGET_NODE_MISMATCH,
            (error as SyncImportException).reason
        )
        assertImportDidNotWrite()
        assertEquals(
            0,
            targetRepository.observeSnapshot().first().state.phrases.size
        )
        assertEquals(
            LOCAL_NODE,
            targetDatabase.daoVibeDao().getDeviceIdentity()?.nodeId
        )
    }

    @Test
    fun missingLocalIdentityRejectsSyncImportBeforeAnyWrite() = runTest {
        val database = newDatabase()
        try {
            val sync = PacketSyncRepository(
                database = database,
                nowSeconds = { NOW }
            )
            val packet = phrasePacket(1)
            val batch = SyncProtocol.createBatch(
                request = request(),
                packets = listOf(packet),
                nextCursor = SyncProtocol.cursorFor(100L, packet.packetId),
                hasMore = false
            )

            val error = runCatching {
                sync.importBatch(
                    batch = batch,
                    remoteNodeId = REMOTE_NODE,
                    pairingId = PAIRING_ID,
                    importedAt = NOW
                )
            }.exceptionOrNull()

            assertTrue(error is SyncImportException)
            assertEquals(
                SyncRejectReason.TARGET_NODE_MISMATCH,
                (error as SyncImportException).reason
            )
            assertEquals(
                0,
                database.daoVibeDao().listPacketsInLedgerOrder().size
            )
            assertEquals(
                null,
                database.daoVibeDao().getPeerSyncState(REMOTE_NODE)
            )
        } finally {
            database.close()
        }
    }

    @Test
    fun identicalAlreadyStoredPacketDoesNotCreateDuplicateRow() = runTest {
        val packet = phrasePacket(1)
        sourceRepository.receivePacket(packet, receivedAt = 100L)
        val firstBatch = sourceSync.exportWindow(request())
        targetSync.importBatch(
            batch = firstBatch,
            remoteNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            importedAt = NOW
        )

        val cursor = firstBatch.nextCursor
        val duplicateBatch = SyncProtocol.createBatch(
            request = request(cursor = cursor),
            packets = listOf(packet),
            nextCursor = cursor,
            hasMore = false
        )
        val result = targetSync.importBatch(
            batch = duplicateBatch,
            remoteNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            importedAt = NOW
        )

        assertEquals(0, result.insertedPackets)
        assertEquals(1, result.duplicatePackets)
        assertEquals(
            1,
            targetDatabase.daoVibeDao().listPacketsInLedgerOrder().size
        )
        assertEquals(
            cursor,
            targetDatabase.daoVibeDao()
                .getPeerSyncState(REMOTE_NODE)
                ?.inboundCursor
        )
    }

    @Test
    fun conflictingDuplicatePacketRejectsWholeBatch() = runTest {
        val packet = phrasePacket(1)
        sourceRepository.receivePacket(packet, receivedAt = 100L)
        val firstBatch = sourceSync.exportWindow(request())
        targetSync.importBatch(
            batch = firstBatch,
            remoteNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            importedAt = NOW
        )
        val conflicting = packet.copy(signature = "different-signature")
        val duplicateBatch = SyncProtocol.createBatch(
            request = request(cursor = firstBatch.nextCursor),
            packets = listOf(conflicting),
            nextCursor = firstBatch.nextCursor,
            hasMore = false
        )

        val error = runCatching {
            targetSync.importBatch(
                batch = duplicateBatch,
                remoteNodeId = REMOTE_NODE,
                pairingId = PAIRING_ID,
                importedAt = NOW
            )
        }.exceptionOrNull()

        assertTrue(error is SyncImportException)
        assertEquals(
            SyncRejectReason.CONFLICTING_DUPLICATE_PACKET,
            (error as SyncImportException).reason
        )
        assertEquals(
            1,
            targetDatabase.daoVibeDao().listPacketsInLedgerOrder().size
        )
        assertEquals(
            firstBatch.nextCursor,
            targetDatabase.daoVibeDao()
                .getPeerSyncState(REMOTE_NODE)
                ?.inboundCursor
        )
    }

    @Test
    fun invalidPacketRejectsEntireBatchBeforeAnyWrite() = runTest {
        val valid = phrasePacket(1)
        val invalid = phrasePacket(2).copy(payloadHash = "invalid")
        val batch = SyncProtocol.createBatch(
            request = request(),
            packets = listOf(valid, invalid),
            nextCursor = SyncProtocol.cursorFor(101L, invalid.packetId),
            hasMore = false
        )

        val error = runCatching {
            targetSync.importBatch(
                batch = batch,
                remoteNodeId = REMOTE_NODE,
                pairingId = PAIRING_ID,
                importedAt = NOW
            )
        }.exceptionOrNull()

        assertTrue(error is SyncImportException)
        assertEquals(
            SyncRejectReason.INVALID_PACKET,
            (error as SyncImportException).reason
        )
        assertImportDidNotWrite()
    }

    @Test
    fun expiredPacketRejectsEntireBatchBeforeAnyWrite() = runTest {
        val valid = phrasePacket(1)
        val expired = phrasePacket(
            index = 2,
            expiresAt = NOW - 1L
        )
        val batch = SyncProtocol.createBatch(
            request = request(),
            packets = listOf(valid, expired),
            nextCursor = SyncProtocol.cursorFor(101L, expired.packetId),
            hasMore = false
        )

        val error = runCatching {
            targetSync.importBatch(
                batch = batch,
                remoteNodeId = REMOTE_NODE,
                pairingId = PAIRING_ID,
                importedAt = NOW
            )
        }.exceptionOrNull()

        assertTrue(error is SyncImportException)
        assertEquals(
            SyncRejectReason.EXPIRED_PACKET,
            (error as SyncImportException).reason
        )
        assertImportDidNotWrite()
    }

    @Test
    fun derivedReplayFailureRollsBackPacketsAndCursor() = runTest {
        val validPhrase = phrasePacket(1)
        val unresolvedProposal = meaningProposalPacket(
            phraseId = "phrase_missing",
            meaningId = "meaning_missing"
        )
        val batch = SyncProtocol.createBatch(
            request = request(),
            packets = listOf(validPhrase, unresolvedProposal),
            nextCursor = SyncProtocol.cursorFor(
                receivedAt = 101L,
                packetId = unresolvedProposal.packetId
            ),
            hasMore = false
        )

        val error = runCatching {
            targetSync.importBatch(
                batch = batch,
                remoteNodeId = REMOTE_NODE,
                pairingId = PAIRING_ID,
                importedAt = NOW
            )
        }.exceptionOrNull()

        assertTrue(error is IllegalArgumentException)
        assertImportDidNotWrite()
        assertEquals(0, targetDatabase.daoVibeDao().listPhrases().size)
    }

    @Test
    fun cursorCannotMoveBackwardAndStoredCursorRemainsUnchanged() = runTest {
        val packet = phrasePacket(1)
        sourceRepository.receivePacket(packet, receivedAt = 100L)
        val firstBatch = sourceSync.exportWindow(request())
        targetSync.importBatch(
            batch = firstBatch,
            remoteNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            importedAt = NOW
        )

        val regressingBatch = SyncBatch(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = SESSION_ID,
            sourceNodeId = REMOTE_NODE,
            targetNodeId = LOCAL_NODE,
            pairingId = PAIRING_ID,
            requestCursor = firstBatch.nextCursor,
            nextCursor = START_SYNC_CURSOR,
            hasMore = false,
            packets = emptyList()
        )
        val error = runCatching {
            targetSync.importBatch(
                batch = regressingBatch,
                remoteNodeId = REMOTE_NODE,
                pairingId = PAIRING_ID,
                importedAt = NOW
            )
        }.exceptionOrNull()

        assertTrue(error is SyncProtocolException)
        assertEquals(
            SyncRejectReason.CURSOR_REGRESSION,
            (error as SyncProtocolException).reason
        )
        assertEquals(
            firstBatch.nextCursor,
            targetDatabase.daoVibeDao()
                .getPeerSyncState(REMOTE_NODE)
                ?.inboundCursor
        )
    }

    @Test
    fun importPreservesIdentityAuthorsPairingAndDoesNotStoreSyncMessages() =
        runTest {
            targetDatabase.daoVibeDao().insertDeviceIdentity(
                DeviceIdentityEntity(
                    id = 1,
                    nodeId = LOCAL_NODE,
                    displayName = "Local Node",
                    createdAt = CREATED_AT
                )
            )
            val pairing = PairingRecordEntity(
                pairingId = PAIRING_ID,
                localNodeId = LOCAL_NODE,
                remoteNodeId = REMOTE_NODE,
                remoteDisplayName = "Remote Node",
                remotePlatform = "desktop",
                remoteRole = "computer",
                status = "approved",
                createdAt = CREATED_AT,
                pairedAt = CREATED_AT + 1L,
                updatedAt = NOW
            )
            targetDatabase.daoVibeDao().upsertPairingRecord(pairing)
            val packet = phrasePacket(1, author = REMOTE_NODE)
            val batch = SyncProtocol.createBatch(
                request = request(),
                packets = listOf(packet),
                nextCursor = SyncProtocol.cursorFor(100L, packet.packetId),
                hasMore = false
            )

            targetSync.importBatch(
                batch = batch,
                remoteNodeId = REMOTE_NODE,
                pairingId = PAIRING_ID,
                importedAt = NOW
            )

            val identity = targetRepository.ensureDeviceIdentity()
            assertEquals(LOCAL_NODE, identity.nodeId)
            assertEquals(
                REMOTE_NODE,
                targetDatabase.daoVibeDao()
                    .listPacketsInLedgerOrder()
                    .single()
                    .author
            )
            assertEquals(
                listOf(pairing),
                targetDatabase.daoVibeDao().listPairingRecords()
            )
            assertEquals(
                1,
                targetDatabase.daoVibeDao().listPacketsInLedgerOrder().size
            )
        }

    @Test
    fun dependencyOutOfOrderPacketsConvergeInIndependentRoomDatabases() =
        runTest {
            val phrase = phrasePacket(1)
            val meaning = meaningProposalPacket(
                phraseId = "phrase_1",
                meaningId = "meaning_1"
            )
            val vote = meaningVotePacket(
                phraseId = "phrase_1",
                meaningId = "meaning_1"
            )
            val orderedById = listOf(phrase, meaning, vote)
                .sortedBy { it.packetId }
            val batch = SyncProtocol.createBatch(
                request = request(),
                packets = listOf(vote, meaning, phrase),
                nextCursor = SyncProtocol.cursorFor(
                    receivedAt = 100L,
                    packetId = orderedById.last().packetId
                ),
                hasMore = false
            )

            val secondDatabase = newDatabase()
            try {
                val secondRepository = LocalMyceliumRepository(
                    database = secondDatabase,
                    nowSeconds = { NOW }
                )
                val secondSync = PacketSyncRepository(
                    database = secondDatabase,
                    nowSeconds = { NOW }
                )
                secondDatabase.daoVibeDao().insertDeviceIdentity(
                    DeviceIdentityEntity(
                        id = 1,
                        nodeId = LOCAL_NODE,
                        displayName = "Second Local Node",
                        createdAt = CREATED_AT
                    )
                )

                targetSync.importBatch(
                    batch = batch,
                    remoteNodeId = REMOTE_NODE,
                    pairingId = PAIRING_ID,
                    importedAt = NOW
                )
                secondSync.importBatch(
                    batch = batch.copy(packets = listOf(phrase, vote, meaning)),
                    remoteNodeId = REMOTE_NODE,
                    pairingId = PAIRING_ID,
                    importedAt = NOW
                )

                val firstState = targetRepository.observeSnapshot().first().state
                val secondState = secondRepository.observeSnapshot().first().state
                assertEquals(firstState, secondState)
                assertEquals(1, firstState.phrases.size)
                assertEquals(1, firstState.phrases.first().meanings.size)
                assertEquals(
                    1.0,
                    firstState.phrases.first().meanings.first().confirms,
                    0.0
                )
            } finally {
                secondDatabase.close()
            }
        }

    private suspend fun assertImportDidNotWrite() {
        assertEquals(
            0,
            targetDatabase.daoVibeDao().listPacketsInLedgerOrder().size
        )
        assertEquals(
            null,
            targetDatabase.daoVibeDao().getPeerSyncState(REMOTE_NODE)
        )
    }

    private fun request(
        cursor: String = START_SYNC_CURSOR,
        limit: Int = DEFAULT_SYNC_BATCH_LIMIT
    ): SyncRequest =
        SyncRequest(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = SESSION_ID,
            sourceNodeId = LOCAL_NODE,
            targetNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            cursor = cursor,
            limit = limit
        )

    private fun phrasePacket(
        index: Int,
        createdAt: Long = CREATED_AT,
        author: String = REMOTE_NODE,
        surfaceText: String = "Phrase $index",
        expiresAt: Long? = null
    ): LmpPacket<PacketPayload> =
        PacketFactory { createdAt }.create(
            packetType = PacketType.PHRASE_OBSERVED,
            zone = "sync_repository_test",
            author = author,
            payload = PhraseObservedPayload(
                phraseId = "phrase_$index",
                surfaceText = surfaceText,
                languageHint = "en",
                inputType = InputType.TEXT
            ),
            expiresAt = expiresAt,
            createdAt = createdAt
        )

    private fun meaningProposalPacket(
        phraseId: String,
        meaningId: String
    ): LmpPacket<PacketPayload> =
        PacketFactory { CREATED_AT }.create(
            packetType = PacketType.MEANING_PROPOSAL,
            zone = "sync_repository_test",
            author = REMOTE_NODE,
            payload = MeaningProposalPayload(
                phraseId = phraseId,
                meaningId = meaningId,
                referenceMeaning = "A dependency-aware meaning",
                confidence = 0.25
            ),
            createdAt = CREATED_AT
        )

    private fun meaningVotePacket(
        phraseId: String,
        meaningId: String
    ): LmpPacket<PacketPayload> =
        PacketFactory { CREATED_AT }.create(
            packetType = PacketType.MEANING_VOTE,
            zone = "sync_repository_test",
            author = REMOTE_NODE,
            payload = MeaningVotePayload(
                phraseId = phraseId,
                meaningId = meaningId,
                vote = VoteValue.CONFIRM,
                confidence = 1.0
            ),
            createdAt = CREATED_AT
        )

    private fun newDatabase(): DaoVibeDatabase =
        Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()

    private companion object {
        const val LOCAL_NODE = "mycelium_node_local"
        const val REMOTE_NODE = "mycelium_node_remote"
        const val PAIRING_ID = "pairing_sync_repository"
        const val SESSION_ID = "session_0123456789abcdef0123456789abcdef"
        const val CREATED_AT = 1_700_000_000L
        const val NOW = 1_700_000_100L
    }
}
