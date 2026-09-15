package org.daovibe.android.core.pairing

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.daovibe.android.core.identity.DeviceIdentityRepository
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.PendingPairingOfferEntity
import org.daovibe.android.core.storage.PairingRecordEntity

class PairingRepository(
    private val database: DaoVibeDatabase,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L }
) {
    private val dao = database.daoVibeDao()
    private val identityRepository = DeviceIdentityRepository(dao, nowSeconds)

    fun observePairingRecords(): Flow<List<PairingRecord>> =
        dao.observePairingRecords().map { records ->
            records.map { it.toPairingRecord() }
        }

    fun observeActivePairings(): Flow<List<PairingRecord>> =
        observePairingRecords().map { records ->
            records.filter { it.status == PairingRecordStatus.APPROVED }
        }

    suspend fun listPairingRecords(): List<PairingRecord> =
        dao.listPairingRecords().map { it.toPairingRecord() }

    suspend fun getPairingRecord(pairingId: String): PairingRecord? =
        dao.getPairingRecord(pairingId)?.toPairingRecord()

    suspend fun findPairingForRemote(
        localNodeId: String,
        remoteNodeId: String
    ): PairingRecord? =
        dao.getPairingRecordForRemote(
            localNodeId = localNodeId,
            remoteNodeId = remoteNodeId
        )?.toPairingRecord()

    suspend fun createPairingOffer(
        sourcePlatform: String = PairingProtocol.ANDROID_PLATFORM,
        sourceRole: String = PairingProtocol.PHONE_ROLE,
        challenge: String? = null,
        createdAt: Long = nowSeconds()
    ): PairingOffer {
        val identity = identityRepository.getOrCreate()
        val offer = PairingProtocol.createOffer(
            sourceNodeId = identity.nodeId,
            sourceDisplayName = identity.displayName,
            sourcePlatform = sourcePlatform,
            sourceRole = sourceRole,
            createdAt = createdAt,
            challenge = challenge ?: java.util.UUID.randomUUID().toString()
        )
        dao.upsertPendingPairingOffer(
            PendingPairingOfferEntity(
                pairingId = offer.pairingId,
                offerJson = PairingJsonCodec.encode(offer),
                localNodeId = identity.nodeId,
                createdAt = offer.createdAt,
                updatedAt = nowSeconds()
            )
        )
        return offer
    }

    suspend fun importPairingApprovalJson(json: String): PairingRecord {
        val approval = PairingJsonCodec.decodeApproval(json)
        val pending = dao.getPendingPairingOffer(approval.pairingId)
            ?: error("No local pending pairing offer matches this approval")
        val offer = PairingJsonCodec.decodeOffer(pending.offerJson)
        return recordPairingApproval(offer, approval)
    }

    /*
     * This is the phone-side foundation for an approval returned by a future
     * computer node. It stores local relationship metadata only.
     */
    suspend fun recordPairingApproval(
        offer: PairingOffer,
        approval: PairingApproval
    ): PairingRecord {
        PairingProtocol.validateOffer(offer)
        PairingProtocol.validateApproval(approval)

        val identity = identityRepository.getOrCreate()
        require(offer.sourceNodeId == identity.nodeId) {
            "Pairing offer belongs to another local node"
        }
        require(approval.pairingId == offer.pairingId) {
            "Pairing approval does not match pairing offer"
        }
        require(approval.targetNodeId == identity.nodeId) {
            "Pairing approval targets another node"
        }
        require(approval.approvingNodeId != identity.nodeId) {
            "A node cannot pair with itself"
        }
        if (offer.challenge != null) {
            require(approval.challengeEcho != null) {
                "Pairing approval must echo the offer challenge"
            }
            require(offer.challenge == approval.challengeEcho) {
                "Pairing approval challenge does not match offer"
            }
        }

        return database.withTransaction {
            val existingForPairing = dao.getPairingRecord(approval.pairingId)
            if (existingForPairing != null) {
                require(existingForPairing.localNodeId == identity.nodeId) {
                    "Pairing record belongs to another local node"
                }
                require(existingForPairing.remoteNodeId == approval.approvingNodeId) {
                    "Pairing approval conflicts with existing remote node"
                }
            }

            val existingForRemote = dao.getPairingRecordForRemote(
                localNodeId = identity.nodeId,
                remoteNodeId = approval.approvingNodeId
            )
            if (
                existingForRemote != null &&
                existingForRemote.pairingId != approval.pairingId &&
                existingForRemote.status == PairingRecordStatus.APPROVED.wireValue
            ) {
                error("Remote node is already paired")
            }

            val record = PairingRecordEntity(
                pairingId = approval.pairingId,
                localNodeId = identity.nodeId,
                remoteNodeId = approval.approvingNodeId,
                remoteDisplayName = approval.approvingDisplayName,
                remotePlatform = approval.approvingPlatform,
                remoteRole = approval.approvingRole,
                status = approval.approvalState.wireValue,
                createdAt = offer.createdAt,
                pairedAt = approval.approvalState
                    .takeIf { it == PairingApprovalState.APPROVED }
                    ?.let { approval.approvedAt },
                updatedAt = approval.approvedAt
            )
            dao.upsertPairingRecord(record)
            record.toPairingRecord()
        }
    }
}

private fun PairingRecordEntity.toPairingRecord(): PairingRecord =
    PairingRecord(
        pairingId = pairingId,
        localNodeId = localNodeId,
        remoteNodeId = remoteNodeId,
        remoteDisplayName = remoteDisplayName,
        remotePlatform = remotePlatform,
        remoteRole = remoteRole,
        status = PairingRecordStatus.fromWireValue(status)
            ?: error("Invalid stored pairing status: $status"),
        createdAt = createdAt,
        pairedAt = pairedAt
    )
