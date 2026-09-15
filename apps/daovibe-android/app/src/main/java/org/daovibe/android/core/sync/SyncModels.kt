package org.daovibe.android.core.sync

import org.daovibe.android.core.connection.ConnectionSession
import org.daovibe.android.core.connection.PeerTransportFailure

data class SyncImportResult(
    val totalPackets: Int,
    val insertedPackets: Int,
    val duplicatePackets: Int,
    val cursorBefore: String,
    val cursorAfter: String
)

sealed interface SyncRunResult {
    val session: ConnectionSession

    data class Completed(
        override val session: ConnectionSession,
        val importedPackets: Int,
        val duplicatePackets: Int,
        val windowsProcessed: Int,
        val latestCursor: String
    ) : SyncRunResult

    data class Rejected(
        override val session: ConnectionSession,
        val reasonCode: String,
        val message: String
    ) : SyncRunResult

    data class Failed(
        override val session: ConnectionSession,
        val failure: PeerTransportFailure
    ) : SyncRunResult
}

sealed interface SyncResponderResult {
    val session: ConnectionSession?

    data class Completed(
        override val session: ConnectionSession,
        val windowsProcessed: Int
    ) : SyncResponderResult

    data class Rejected(
        override val session: ConnectionSession?,
        val reasonCode: String,
        val message: String
    ) : SyncResponderResult

    data class Failed(
        override val session: ConnectionSession?,
        val failure: PeerTransportFailure
    ) : SyncResponderResult
}

class SyncImportException(
    val reason: SyncRejectReason,
    message: String
) : IllegalArgumentException(message)
