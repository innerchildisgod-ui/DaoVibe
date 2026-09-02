package org.daovibe.android.core.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.mycelium.PacketReceiveDecision
import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PhraseObservedPayload
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
        assertEquals("phrase_room", snapshot.state.phrases.first().phraseId)
        assertEquals("Room phrase", snapshot.state.phrases.first().surfaceText)
    }

    @Test
    fun deviceIdentityPersistsNodeIdAcrossDisplayNameChanges() = runTest {
        val original = repository.identityRepository.getOrCreate()
        val updated = repository.identityRepository.updateDisplayName("Pocket Node")

        assertEquals(original.nodeId, updated.nodeId)
        assertEquals(original.createdAt, updated.createdAt)
        assertEquals("Pocket Node", updated.displayName)
    }

    private fun observedPacket(
        createdAt: Long,
        expiresAt: Long? = null
    ) = PacketFactory { createdAt }.create(
        packetType = PacketType.PHRASE_OBSERVED,
        zone = "test_zone",
        author = "author_a",
        payload = PhraseObservedPayload(
            phraseId = "phrase_room",
            surfaceText = "Room phrase",
            languageHint = "en",
            inputType = InputType.TEXT
        ),
        expiresAt = expiresAt,
        createdAt = createdAt
    )
}

