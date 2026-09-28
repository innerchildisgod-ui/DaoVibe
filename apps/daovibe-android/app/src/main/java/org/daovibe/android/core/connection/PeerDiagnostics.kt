package org.daovibe.android.core.connection

import org.daovibe.android.core.storage.KnownPeerEntity
import org.daovibe.android.core.sync.SyncRunResult

enum class PeerSyncOutcome { SUCCESS, FAILED }

enum class PeerSyncStage {
    CONNECT, HELLO, ACCEPT, PULL, IMPORT, REVERSE_SYNC, COMPLETE
}

enum class PeerSyncErrorCategory {
    INVALID_PEER_CONFIG, UNREACHABLE, TIMEOUT, PAIRING_MISMATCH,
    PROTOCOL_MISMATCH, REMOTE_REJECTED, MALFORMED_FRAME, VALIDATION_FAILED,
    IMPORT_FAILED, IO, UNKNOWN
}

data class PeerSyncResult(
    val remoteNodeId: String,
    val outcome: PeerSyncOutcome,
    val stage: PeerSyncStage,
    val errorCategory: PeerSyncErrorCategory? = null,
    val attempts: Int,
    val importedPackets: Int = 0,
    val duplicatePackets: Int = 0,
    val exportedPackets: Int? = null,
    val startedAt: Long,
    val finishedAt: Long,
    val message: String? = null,
    val cursor: String? = null
)

enum class PeerHealth { NEVER_CONTACTED, HEALTHY, STALE, ERROR }

fun derivePeerHealth(peer: KnownPeer, nowSeconds: Long, staleAfterSeconds: Long = 86_400L): PeerHealth {
    val success = peer.lastSuccessfulContactAt
    if (success == null) return if (peer.lastFailureAt == null) PeerHealth.NEVER_CONTACTED else PeerHealth.ERROR
    if (peer.lastFailureAt != null && peer.lastFailureAt > success) return PeerHealth.ERROR
    return if (nowSeconds - success > staleAfterSeconds) PeerHealth.STALE else PeerHealth.HEALTHY
}

object PeerSyncClassifier {
    fun fromSyncResult(remoteNodeId: String, result: SyncRunResult, attempts: Int, startedAt: Long, finishedAt: Long): PeerSyncResult =
        when (result) {
            is SyncRunResult.Completed -> PeerSyncResult(
                remoteNodeId, PeerSyncOutcome.SUCCESS, PeerSyncStage.COMPLETE, attempts = attempts,
                importedPackets = result.importedPackets, duplicatePackets = result.duplicatePackets,
                startedAt = startedAt, finishedAt = finishedAt, cursor = result.latestCursor
            )
            is SyncRunResult.Rejected -> PeerSyncResult(
                remoteNodeId, PeerSyncOutcome.FAILED, PeerSyncStage.ACCEPT,
                categoryForRejection(result.reasonCode), attempts = attempts,
                startedAt = startedAt, finishedAt = finishedAt, message = result.message
            )
            is SyncRunResult.Failed -> PeerSyncResult(
                remoteNodeId, PeerSyncOutcome.FAILED,
                stageForFailure(result.failure.code),
                categoryForFailure(result.failure.code), attempts = attempts,
                startedAt = startedAt, finishedAt = finishedAt, message = result.failure.message
            )
        }

    fun fromException(remoteNodeId: String, error: Throwable, attempts: Int, startedAt: Long, finishedAt: Long): PeerSyncResult {
        val message = error.message?.take(500) ?: "sync failed"
        return PeerSyncResult(remoteNodeId, PeerSyncOutcome.FAILED, PeerSyncStage.CONNECT, PeerSyncErrorCategory.IO, attempts = attempts, startedAt = startedAt, finishedAt = finishedAt, message = message)
    }

    private fun stageForFailure(code: PeerTransportFailureCode): PeerSyncStage = when (code) {
        PeerTransportFailureCode.INVALID_ENDPOINT,
        PeerTransportFailureCode.CONNECTION_REFUSED,
        PeerTransportFailureCode.UNREACHABLE,
        PeerTransportFailureCode.TIMEOUT -> PeerSyncStage.CONNECT
        PeerTransportFailureCode.MALFORMED_FRAME,
        PeerTransportFailureCode.FRAME_TOO_LARGE,
        PeerTransportFailureCode.TRUNCATED_FRAME,
        PeerTransportFailureCode.INVALID_MESSAGE -> PeerSyncStage.HELLO
        PeerTransportFailureCode.CONNECTION_CLOSED,
        PeerTransportFailureCode.IO_FAILURE -> PeerSyncStage.CONNECT
    }

    private fun categoryForFailure(code: PeerTransportFailureCode): PeerSyncErrorCategory = when (code) {
        PeerTransportFailureCode.INVALID_ENDPOINT -> PeerSyncErrorCategory.INVALID_PEER_CONFIG
        PeerTransportFailureCode.TIMEOUT -> PeerSyncErrorCategory.TIMEOUT
        PeerTransportFailureCode.CONNECTION_REFUSED,
        PeerTransportFailureCode.UNREACHABLE,
        PeerTransportFailureCode.CONNECTION_CLOSED -> PeerSyncErrorCategory.UNREACHABLE
        PeerTransportFailureCode.MALFORMED_FRAME,
        PeerTransportFailureCode.FRAME_TOO_LARGE,
        PeerTransportFailureCode.TRUNCATED_FRAME -> PeerSyncErrorCategory.MALFORMED_FRAME
        PeerTransportFailureCode.INVALID_MESSAGE -> PeerSyncErrorCategory.VALIDATION_FAILED
        PeerTransportFailureCode.IO_FAILURE -> PeerSyncErrorCategory.IO
    }

    private fun categoryForRejection(reason: String): PeerSyncErrorCategory = when (reason.lowercase()) {
        "pairing_not_found", "pairing_inactive", "pairing_peer_mismatch", "pairing_mismatch" -> PeerSyncErrorCategory.PAIRING_MISMATCH
        "unsupported_connection_version", "incompatible_connection_version", "incompatible_packet_version" -> PeerSyncErrorCategory.PROTOCOL_MISMATCH
        else -> PeerSyncErrorCategory.REMOTE_REJECTED
    }
}

fun KnownPeerEntity.health(nowSeconds: Long, staleAfterSeconds: Long = 86_400L): PeerHealth =
    derivePeerHealth(
        KnownPeer(remoteNodeId, displayName, host, port, pairingId, lastSuccessfulContactAt, lastError, lastFailureAt),
        nowSeconds,
        staleAfterSeconds
    )
