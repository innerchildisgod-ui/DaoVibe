package org.daovibe.android.core.pairing

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PhraseObservedPayload
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
class PairingRepositoryTest {
    private lateinit var database: DaoVibeDatabase
    private lateinit var pairingRepository: PairingRepository

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()
        pairingRepository = PairingRepository(
            database = database,
            nowSeconds = { 1_700_000_100L }
        )
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun pairingOfferUsesImmutableLocalNodeId() = runTest {
        val identity = pairingRepository.createPairingOffer(
            challenge = "offer-challenge",
            createdAt = 1_700_000_000L
        ).let { offer ->
            PairingJsonCodec.decodeOffer(PairingJsonCodec.encode(offer))
        }

        val localIdentity = org.daovibe.android.core.identity.DeviceIdentityRepository(
            database.daoVibeDao(),
            nowSeconds = { 1_700_000_100L }
        ).getOrCreate()

        assertEquals(localIdentity.nodeId, identity.sourceNodeId)
    }

    @Test
    fun localNodeCannotPairWithItself() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "self-pair-challenge",
            createdAt = 1_700_000_000L
        )
        val localNodeId = offer.sourceNodeId

        val result = runCatching {
            pairingRepository.recordPairingApproval(
                offer = offer,
                approval = approvalFor(
                    offer = offer,
                    approvingNodeId = localNodeId
                )
            )
        }

        assertTrue(result.isFailure)
        assertTrue(
            result.exceptionOrNull()?.message?.contains("cannot pair with itself") == true
        )
        assertTrue(pairingRepository.listPairingRecords().isEmpty())
    }

    @Test
    fun approvalCreatesOneRelationshipAndDuplicateApprovalIsIdempotent() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "approval-challenge",
            createdAt = 1_700_000_000L
        )
        val approval = approvalFor(offer)

        val first = pairingRepository.recordPairingApproval(offer, approval)
        val second = pairingRepository.recordPairingApproval(offer, approval)

        assertEquals(first, second)
        assertEquals(1, pairingRepository.listPairingRecords().size)
        assertEquals(1, pairingRepository.observeActivePairings().first().size)
    }

    @Test
    fun approvalWithMatchingChallengeEchoIsAccepted() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "matching-echo",
            createdAt = 1_700_000_000L
        )

        val record = pairingRepository.recordPairingApproval(
            offer = offer,
            approval = approvalFor(offer).copy(
                challengeEcho = offer.challenge
            )
        )

        assertEquals(PairingRecordStatus.APPROVED, record.status)
    }

    @Test
    fun importsValidDesktopApprovalAgainstStoredOffer() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "import-challenge",
            createdAt = 1_700_000_000L
        )

        val record = pairingRepository.importPairingApprovalJson(
            PairingJsonCodec.encode(approvalFor(offer))
        )

        assertEquals(offer.pairingId, record.pairingId)
        assertEquals("mycelium_node_computer", record.remoteNodeId)
    }

    @Test
    fun importRejectsApprovalWithWrongPairingId() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "wrong-pairing-id",
            createdAt = 1_700_000_000L
        )
        val approval = approvalFor(offer).copy(pairingId = "pairing_wrong")

        val result = runCatching {
            pairingRepository.importPairingApprovalJson(PairingJsonCodec.encode(approval))
        }

        assertTrue(result.isFailure)
        assertTrue(pairingRepository.listPairingRecords().isEmpty())
    }

    @Test
    fun importRejectsApprovalWithWrongTargetNode() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "wrong-target",
            createdAt = 1_700_000_000L
        )
        val approval = approvalFor(offer).copy(targetNodeId = "another_android_node")

        val result = runCatching {
            pairingRepository.importPairingApprovalJson(PairingJsonCodec.encode(approval))
        }

        assertTrue(result.isFailure)
        assertTrue(
            result.exceptionOrNull()?.message?.contains("targets another node") == true
        )
        assertTrue(pairingRepository.listPairingRecords().isEmpty())
    }

    @Test
    fun importRejectsApprovalWithWrongChallengeEcho() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "wrong-import-echo",
            createdAt = 1_700_000_000L
        )
        val approval = approvalFor(offer).copy(challengeEcho = "wrong-echo")

        val result = runCatching {
            pairingRepository.importPairingApprovalJson(PairingJsonCodec.encode(approval))
        }

        assertTrue(result.isFailure)
        assertTrue(
            result.exceptionOrNull()?.message?.contains("does not match") == true
        )
        assertTrue(pairingRepository.listPairingRecords().isEmpty())
    }

    @Test
    fun importRejectsSelfPairing() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "self-import",
            createdAt = 1_700_000_000L
        )
        val approval = approvalFor(offer).copy(approvingNodeId = offer.sourceNodeId)

        val result = runCatching {
            pairingRepository.importPairingApprovalJson(PairingJsonCodec.encode(approval))
        }

        assertTrue(result.isFailure)
        assertTrue(
            result.exceptionOrNull()?.message?.contains("cannot pair with itself") == true
        )
        assertTrue(pairingRepository.listPairingRecords().isEmpty())
    }

    @Test
    fun duplicateApprovalImportIsIdempotent() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "duplicate-import",
            createdAt = 1_700_000_000L
        )
        val approvalJson = PairingJsonCodec.encode(approvalFor(offer))

        val first = pairingRepository.importPairingApprovalJson(approvalJson)
        val second = pairingRepository.importPairingApprovalJson(approvalJson)

        assertEquals(first, second)
        assertEquals(1, pairingRepository.listPairingRecords().size)
    }

    @Test
    fun approvalImportDoesNotChangeIdentityOrPacketLedger() = runTest {
        val myceliumRepository = LocalMyceliumRepository(
            database = database,
            nowSeconds = { 1_700_000_100L }
        )
        val identityBefore = myceliumRepository.ensureDeviceIdentity()
        myceliumRepository.receivePacket(
            packet = PacketFactory { 1_700_000_000L }.create(
                packetType = PacketType.PHRASE_OBSERVED,
                zone = "approval_import_zone",
                author = identityBefore.nodeId,
                payload = PhraseObservedPayload(
                    phraseId = "approval_import_phrase",
                    surfaceText = "Approval import phrase",
                    languageHint = "en",
                    inputType = InputType.TEXT
                ),
                createdAt = 1_700_000_000L
            ),
            receivedAt = 1_700_000_100L
        )
        val ledgerBefore = database.daoVibeDao().listPacketsInLedgerOrder()

        val offer = pairingRepository.createPairingOffer(
            challenge = "ledger-preservation",
            createdAt = 1_700_000_001L
        )
        pairingRepository.importPairingApprovalJson(
            PairingJsonCodec.encode(approvalFor(offer))
        )

        val identityAfter = myceliumRepository.ensureDeviceIdentity()
        val ledgerAfter = database.daoVibeDao().listPacketsInLedgerOrder()

        assertEquals(identityBefore.nodeId, identityAfter.nodeId)
        assertEquals(ledgerBefore, ledgerAfter)
    }

    @Test
    fun approvalMissingChallengeEchoIsRejectedWhenOfferHasChallenge() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "missing-echo",
            createdAt = 1_700_000_000L
        )

        val result = runCatching {
            pairingRepository.recordPairingApproval(
                offer = offer,
                approval = approvalFor(offer).copy(challengeEcho = null)
            )
        }

        assertTrue(result.isFailure)
        assertTrue(
            result.exceptionOrNull()?.message?.contains("must echo") == true
        )
        assertTrue(pairingRepository.listPairingRecords().isEmpty())
    }

    @Test
    fun approvalWithWrongChallengeEchoIsRejected() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "wrong-echo",
            createdAt = 1_700_000_000L
        )

        val result = runCatching {
            pairingRepository.recordPairingApproval(
                offer = offer,
                approval = approvalFor(offer).copy(
                    challengeEcho = "different-development-value"
                )
            )
        }

        assertTrue(result.isFailure)
        assertTrue(
            result.exceptionOrNull()?.message?.contains("does not match") == true
        )
        assertTrue(pairingRepository.listPairingRecords().isEmpty())
    }

    @Test
    fun offerWithoutChallengeDoesNotRequireChallengeEcho() = runTest {
        val challengedOffer = pairingRepository.createPairingOffer(
            challenge = "temporary-base",
            createdAt = 1_700_000_000L
        )
        val offerWithoutChallenge = challengedOffer.copy(
            pairingId = PairingProtocol.pairingIdFor(
                sourceNodeId = challengedOffer.sourceNodeId,
                createdAt = challengedOffer.createdAt,
                challenge = null
            ),
            challenge = null
        )
        PairingProtocol.validateOffer(offerWithoutChallenge)

        val record = pairingRepository.recordPairingApproval(
            offer = offerWithoutChallenge,
            approval = approvalFor(offerWithoutChallenge).copy(
                challengeEcho = null
            )
        )

        assertEquals(PairingRecordStatus.APPROVED, record.status)
    }

    @Test
    fun aSecondOfferForAnAlreadyPairedRemoteDoesNotCreateAnotherRelationship() =
        runTest {
            val firstOffer = pairingRepository.createPairingOffer(
                challenge = "first-offer",
                createdAt = 1_700_000_000L
            )
            pairingRepository.recordPairingApproval(
                firstOffer,
                approvalFor(firstOffer)
            )

            val secondOffer = pairingRepository.createPairingOffer(
                challenge = "second-offer",
                createdAt = 1_700_000_002L
            )
            val result = runCatching {
                pairingRepository.recordPairingApproval(
                    secondOffer,
                    approvalFor(
                        offer = secondOffer,
                        approvedAt = 1_700_000_003L
                    )
                )
            }

            assertTrue(result.isFailure)
            assertEquals(1, pairingRepository.observeActivePairings().first().size)
        }

    @Test
    fun rejectedPairingIsPersistedButNotActive() = runTest {
        val offer = pairingRepository.createPairingOffer(
            challenge = "rejection-challenge",
            createdAt = 1_700_000_000L
        )

        val record = pairingRepository.recordPairingApproval(
            offer = offer,
            approval = approvalFor(
                offer = offer,
                state = PairingApprovalState.REJECTED
            )
        )

        assertEquals(PairingRecordStatus.REJECTED, record.status)
        assertEquals(1, pairingRepository.listPairingRecords().size)
        assertTrue(pairingRepository.observeActivePairings().first().isEmpty())
    }

    @Test
    fun pairingSurvivesDatabaseRecreation() = runTest {
        val path = File(
            ApplicationProvider.getApplicationContext<android.content.Context>().cacheDir,
            "pairing-recreation.db"
        )
        path.delete()

        val firstDatabase = Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java,
            path.absolutePath
        ).allowMainThreadQueries().build()
        val firstRepository = PairingRepository(
            firstDatabase,
            nowSeconds = { 1_700_000_100L }
        )
        val offer = firstRepository.createPairingOffer(
            challenge = "persistent-challenge",
            createdAt = 1_700_000_000L
        )
        firstRepository.recordPairingApproval(offer, approvalFor(offer))
        val localNodeId = offer.sourceNodeId
        firstDatabase.close()

        val secondDatabase = Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java,
            path.absolutePath
        ).allowMainThreadQueries().build()
        try {
            val secondRepository = PairingRepository(
                secondDatabase,
                nowSeconds = { 1_700_000_200L }
            )
            val restored = secondRepository.observeActivePairings().first().single()

            assertEquals(localNodeId, restored.localNodeId)
            assertEquals(offer.pairingId, restored.pairingId)
        } finally {
            secondDatabase.close()
            path.delete()
        }
    }

    @Test
    fun pairingDoesNotChangeLocalNodeIdOrPacketAuthors() = runTest {
        val myceliumRepository = LocalMyceliumRepository(
            database = database,
            nowSeconds = { 1_700_000_100L }
        )
        val localIdentity = myceliumRepository.ensureDeviceIdentity()
        myceliumRepository.receivePacket(
            packet = PacketFactory { 1_700_000_000L }.create(
                packetType = PacketType.PHRASE_OBSERVED,
                zone = "pairing_test_zone",
                author = localIdentity.nodeId,
                payload = PhraseObservedPayload(
                    phraseId = "pairing_phrase",
                    surfaceText = "Pairing phrase",
                    languageHint = "en",
                    inputType = InputType.TEXT
                ),
                createdAt = 1_700_000_000L
            ),
            receivedAt = 1_700_000_100L
        )
        val authorsBefore = database.daoVibeDao()
            .listPacketsInLedgerOrder()
            .map { it.author }

        val offer = pairingRepository.createPairingOffer(
            challenge = "author-preservation-challenge",
            createdAt = 1_700_000_001L
        )
        pairingRepository.recordPairingApproval(offer, approvalFor(offer))

        val identityAfter = myceliumRepository.ensureDeviceIdentity()
        val authorsAfter = database.daoVibeDao()
            .listPacketsInLedgerOrder()
            .map { it.author }

        assertEquals(localIdentity.nodeId, identityAfter.nodeId)
        assertEquals(authorsBefore, authorsAfter)
        assertEquals(listOf(localIdentity.nodeId), authorsAfter)
    }

    private fun approvalFor(
        offer: PairingOffer,
        approvingNodeId: String = "mycelium_node_computer",
        approvedAt: Long = 1_700_000_001L,
        state: PairingApprovalState = PairingApprovalState.APPROVED
    ): PairingApproval =
        PairingApproval(
            protocolVersion = PAIRING_PROTOCOL_VERSION,
            pairingId = offer.pairingId,
            approvingNodeId = approvingNodeId,
            approvingDisplayName = "Desk Node",
            approvingPlatform = "desktop",
            approvingRole = PairingProtocol.COMPUTER_ROLE,
            targetNodeId = offer.sourceNodeId,
            approvedAt = approvedAt,
            approvalState = state,
            challengeEcho = offer.challenge
        )
}
