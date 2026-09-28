package org.daovibe.android.core.connection

import kotlinx.coroutines.delay
import org.daovibe.android.core.sync.SyncRunResult

data class PeerSyncAttempt(
    val peerNodeId: String,
    val result: SyncRunResult?,
    val error: String? = null,
    val attempts: Int,
    val structuredResult: PeerSyncResult? = null
)

interface PeerSyncRegistry {
    suspend fun listPeers(): List<KnownPeer>
    suspend fun getPeer(remoteNodeId: String): KnownPeer?
    suspend fun markSuccess(remoteNodeId: String)
    suspend fun markFailure(remoteNodeId: String, error: String)
    suspend fun recordSuccess(result: PeerSyncResult) { markSuccess(result.remoteNodeId) }
    suspend fun recordFailure(result: PeerSyncResult) { markFailure(result.remoteNodeId, result.message ?: "sync failed") }
}

/** Explicit, sequential, bounded reconnect/sync helper. It never runs as a daemon. */
class PeerSyncCoordinator(
    private val registry: PeerSyncRegistry,
    private val connection: ConnectionRepository? = null,
    private val retryCount: Int = 2,
    private val retryBackoffMillis: Long = 150L,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L },
    private val syncOperation: (suspend (KnownPeer) -> SyncRunResult)? = null
) {
    suspend fun syncOne(remoteNodeId: String): PeerSyncAttempt {
        val peer = registry.getPeer(remoteNodeId)
            ?: return PeerSyncAttempt(remoteNodeId, null, "peer is not configured", 0)
        var lastError: String? = null
        var lastResult: SyncRunResult? = null
        var lastStructured: PeerSyncResult? = null
        val startedAt = nowSeconds()
        val maxAttempts = retryCount.coerceIn(1, 2)
        repeat(maxAttempts) { index ->
            try {
                val result = syncOperation?.invoke(peer)
                    ?: connection!!.syncWithPairedNode(peer.remoteNodeId, peer.endpoint)
                val structured = PeerSyncClassifier.fromSyncResult(peer.remoteNodeId, result, index + 1, startedAt, nowSeconds())
                lastResult = result
                lastStructured = structured
                if (structured.outcome == PeerSyncOutcome.SUCCESS) {
                    registry.recordSuccess(structured)
                    return PeerSyncAttempt(peer.remoteNodeId, result, attempts = index + 1, structuredResult = structured)
                }
                registry.recordFailure(structured)
                lastError = structured.message ?: "sync failed"
                if (index + 1 < maxAttempts) delay(retryBackoffMillis)
            } catch (error: Exception) {
                lastError = error.message ?: "sync failed"
                val structured = PeerSyncClassifier.fromException(peer.remoteNodeId, error, index + 1, startedAt, nowSeconds())
                lastStructured = structured
                registry.recordFailure(structured)
                if (index + 1 < maxAttempts) delay(retryBackoffMillis)
            }
        }
        return PeerSyncAttempt(peer.remoteNodeId, lastResult, lastError, maxAttempts, lastStructured)
    }

    suspend fun syncAll(): List<PeerSyncAttempt> =
        registry.listPeers().sortedBy { it.remoteNodeId }.map { syncOne(it.remoteNodeId) }

    /** Same bounded path for an already paired UI row that is not yet in the
     * manual peer registry. */
    suspend fun syncDirect(remoteNodeId: String, endpoint: PeerEndpoint): PeerSyncAttempt {
        var lastError: String? = null
        val maxAttempts = retryCount.coerceIn(1, 2)
        repeat(maxAttempts) { index ->
            try {
                val result = connection!!.syncWithPairedNode(remoteNodeId, endpoint)
                return PeerSyncAttempt(remoteNodeId, result, attempts = index + 1)
            } catch (error: Exception) {
                lastError = error.message ?: "sync failed"
                if (index + 1 < maxAttempts) delay(retryBackoffMillis)
            }
        }
        return PeerSyncAttempt(remoteNodeId, null, lastError, maxAttempts)
    }
}
