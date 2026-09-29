package org.daovibe.android.core.connection

import kotlinx.coroutines.flow.Flow
import org.daovibe.android.core.identity.DeviceIdentityRepository
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.KnownPeerEntity

data class KnownPeer(
    val remoteNodeId: String,
    val displayName: String?,
    val host: String,
    val port: Int,
    val pairingId: String,
    val lastSuccessfulContactAt: Long?,
    val lastError: String?,
    val lastFailureAt: Long? = null,
    val lastOutcome: String? = null,
    val lastStage: String? = null,
    val lastErrorCategory: String? = null,
    val lastAttempts: Int? = null,
    val lastImportedPackets: Int? = null,
    val lastDuplicatePackets: Int? = null,
    val lastExportedPackets: Int? = null,
    val lastSyncStartedAt: Long? = null,
    val lastSyncFinishedAt: Long? = null,
    val lastCursor: String? = null,
    val lastDiagnosticAt: Long? = null,
    val lastDiagnosticOutcome: String? = null,
    val lastDiagnosticStage: String? = null,
    val lastDiagnosticErrorCategory: String? = null,
    val lastDiagnosticMessage: String? = null,
    val lastDiagnosticLatencyMs: Long? = null
) {
    val endpoint: PeerEndpoint get() = PeerEndpoint(host, port)
}

class PeerRegistryException(message: String) : IllegalArgumentException(message)

/** Local connection metadata only; it never participates in Mycelium state or hashes. */
class PeerRegistryRepository(
    private val database: DaoVibeDatabase,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L }
) : PeerSyncRegistry {
    private val dao = database.daoVibeDao()
    private val identityRepository = DeviceIdentityRepository(dao, nowSeconds)

    suspend fun localIdentity() = identityRepository.getOrCreate()

    suspend fun importInvite(invite: PeerInvite) {
        PeerInviteCodec.validate(invite, nowSeconds())
        val local = localIdentity()
        if (invite.sourceNodeId == local.nodeId) {
            throw PeerRegistryException("local node invite cannot be imported")
        }
        addOrUpdate(
            remoteNodeId = invite.sourceNodeId,
            host = invite.host,
            port = invite.port,
            pairingId = invite.pairingId,
            displayName = invite.sourceDisplayName
        )
    }

    fun observePeers(): Flow<List<KnownPeerEntity>> = dao.observeKnownPeers()

    override suspend fun listPeers(): List<KnownPeer> = dao.listKnownPeers().map(::toModel)

    override suspend fun getPeer(remoteNodeId: String): KnownPeer? =
        dao.getKnownPeer(remoteNodeId)?.let(::toModel)

    suspend fun addOrUpdate(
        remoteNodeId: String,
        host: String,
        port: Int,
        pairingId: String,
        displayName: String? = null
    ) {
        val nodeId = remoteNodeId.trim()
        if (nodeId.isEmpty()) throw PeerRegistryException("peer node ID must not be blank")
        if (nodeId == identityRepository.getOrCreate().nodeId) {
            throw PeerRegistryException("local node cannot be added as a peer")
        }
        val normalizedHost = host.trim()
        if (normalizedHost.isEmpty()) throw PeerRegistryException("peer host must not be blank")
        if (port !in 1..MAX_TCP_PORT) throw PeerRegistryException("peer port must be between 1 and 65535")
        if (pairingId.trim().isEmpty()) throw PeerRegistryException("pairing ID must not be blank")
        val previous = dao.getKnownPeer(nodeId)
        dao.upsertKnownPeer(
            KnownPeerEntity(
                remoteNodeId = nodeId,
                displayName = displayName?.trim()?.takeIf { it.isNotEmpty() },
                host = normalizedHost,
                port = port,
                pairingId = pairingId.trim(),
                lastSuccessfulContactAt = previous?.lastSuccessfulContactAt,
                lastError = previous?.lastError,
                updatedAt = nowSeconds(),
                lastFailureAt = previous?.lastFailureAt,
                lastOutcome = previous?.lastOutcome,
                lastStage = previous?.lastStage,
                lastErrorCategory = previous?.lastErrorCategory,
                lastAttempts = previous?.lastAttempts,
                lastImportedPackets = previous?.lastImportedPackets,
                lastDuplicatePackets = previous?.lastDuplicatePackets,
                lastExportedPackets = previous?.lastExportedPackets,
                lastSyncStartedAt = previous?.lastSyncStartedAt,
                lastSyncFinishedAt = previous?.lastSyncFinishedAt,
                lastCursor = previous?.lastCursor
                ,lastDiagnosticAt = previous?.lastDiagnosticAt
                ,lastDiagnosticOutcome = previous?.lastDiagnosticOutcome
                ,lastDiagnosticStage = previous?.lastDiagnosticStage
                ,lastDiagnosticErrorCategory = previous?.lastDiagnosticErrorCategory
                ,lastDiagnosticMessage = previous?.lastDiagnosticMessage
                ,lastDiagnosticLatencyMs = previous?.lastDiagnosticLatencyMs
            )
        )
    }

    suspend fun remove(remoteNodeId: String) = dao.deleteKnownPeer(remoteNodeId.trim())

    override suspend fun markSuccess(remoteNodeId: String) =
        dao.markKnownPeerSuccess(remoteNodeId, nowSeconds(), nowSeconds(), "complete", 1, 0, 0, null, nowSeconds(), null)

    override suspend fun markFailure(remoteNodeId: String, error: String) =
        dao.markKnownPeerFailure(remoteNodeId, error.take(500), nowSeconds(), "connect", PeerSyncErrorCategory.UNKNOWN.name.lowercase(), 1, 0, 0, null, nowSeconds(), null)

    override suspend fun recordSuccess(result: PeerSyncResult) {
        dao.markKnownPeerSuccess(result.remoteNodeId, result.finishedAt, result.finishedAt, result.stage.name.lowercase(), result.attempts, result.importedPackets, result.duplicatePackets, result.exportedPackets, result.startedAt, result.cursor)
    }

    override suspend fun recordFailure(result: PeerSyncResult) {
        dao.markKnownPeerFailure(result.remoteNodeId, result.message?.take(500) ?: "sync failed", result.finishedAt, result.stage.name.lowercase(), result.errorCategory?.name?.lowercase() ?: "unknown", result.attempts, result.importedPackets, result.duplicatePackets, result.exportedPackets, result.startedAt, result.cursor)
    }

    override suspend fun recordDiagnose(result: PeerDiagnoseResult) {
        if (result.outcome == PeerDiagnoseOutcome.SUCCESS) {
            dao.markKnownPeerDiagnoseSuccess(result.remoteNodeId, result.finishedAt, result.stage.name.lowercase(), result.latencyMs, result.message)
        } else {
            dao.markKnownPeerDiagnoseFailure(result.remoteNodeId, result.finishedAt, result.stage.name.lowercase(), result.errorCategory?.name?.lowercase() ?: "unknown", result.latencyMs, result.message)
        }
    }

    private fun toModel(value: KnownPeerEntity) = KnownPeer(
        remoteNodeId = value.remoteNodeId,
        displayName = value.displayName,
        host = value.host,
        port = value.port,
        pairingId = value.pairingId,
        lastSuccessfulContactAt = value.lastSuccessfulContactAt,
        lastError = value.lastError,
        lastFailureAt = value.lastFailureAt,
        lastOutcome = value.lastOutcome,
        lastStage = value.lastStage,
        lastErrorCategory = value.lastErrorCategory,
        lastAttempts = value.lastAttempts,
        lastImportedPackets = value.lastImportedPackets,
        lastDuplicatePackets = value.lastDuplicatePackets,
        lastExportedPackets = value.lastExportedPackets,
        lastSyncStartedAt = value.lastSyncStartedAt,
        lastSyncFinishedAt = value.lastSyncFinishedAt,
        lastCursor = value.lastCursor
        ,lastDiagnosticAt = value.lastDiagnosticAt
        ,lastDiagnosticOutcome = value.lastDiagnosticOutcome
        ,lastDiagnosticStage = value.lastDiagnosticStage
        ,lastDiagnosticErrorCategory = value.lastDiagnosticErrorCategory
        ,lastDiagnosticMessage = value.lastDiagnosticMessage
        ,lastDiagnosticLatencyMs = value.lastDiagnosticLatencyMs
    )
}
