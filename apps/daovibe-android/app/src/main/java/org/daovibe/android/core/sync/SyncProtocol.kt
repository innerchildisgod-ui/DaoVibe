package org.daovibe.android.core.sync

import org.daovibe.android.core.connection.ConnectionProtocol
import org.daovibe.android.core.connection.ConnectionSession
import org.daovibe.android.core.connection.ConnectionSessionState
import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.StableJson
import java.nio.charset.StandardCharsets

const val SYNC_PROTOCOL_VERSION = "daovibe-sync-v1"
const val MAX_PACKETS_PER_SYNC_BATCH = 50
const val MAX_SYNC_BATCH_BYTES = 64 * 1024
const val MAX_SYNC_WINDOWS_PER_RUN = 20
const val DEFAULT_SYNC_BATCH_LIMIT = MAX_PACKETS_PER_SYNC_BATCH
const val START_SYNC_CURSOR = "0:"

enum class SyncMessageType(val wireValue: String) {
    SYNC_REQUEST("sync_request"),
    SYNC_BATCH("sync_batch"),
    SYNC_REJECT("sync_reject");

    companion object {
        fun fromWireValue(value: String): SyncMessageType? =
            entries.firstOrNull { it.wireValue == value }
    }
}

enum class SyncRejectReason(val wireValue: String) {
    INVALID_MESSAGE("invalid_message"),
    SESSION_MISMATCH("session_mismatch"),
    NODE_ID_MISMATCH("node_id_mismatch"),
    TARGET_NODE_MISMATCH("target_node_mismatch"),
    PAIRING_MISMATCH("pairing_mismatch"),
    PAIRING_INACTIVE("pairing_inactive"),
    INVALID_CURSOR("invalid_cursor"),
    CURSOR_MISMATCH("cursor_mismatch"),
    CURSOR_REGRESSION("cursor_regression"),
    CURSOR_STALLED("cursor_stalled"),
    INVALID_LIMIT("invalid_limit"),
    BATCH_TOO_LARGE("batch_too_large"),
    PACKET_TOO_LARGE("packet_too_large"),
    CONFLICTING_DUPLICATE_PACKET("conflicting_duplicate_packet"),
    INVALID_PACKET("invalid_packet"),
    EXPIRED_PACKET("expired_packet"),
    MAX_WINDOWS_EXCEEDED("max_windows_exceeded");

    companion object {
        fun fromWireValue(value: String): SyncRejectReason? =
            entries.firstOrNull { it.wireValue == value }
    }
}

sealed interface SyncMessage {
    val messageType: SyncMessageType
    val protocolVersion: String

    fun toStableMap(): Map<String, Any?>
}

data class SyncRequest(
    override val protocolVersion: String,
    val sessionId: String,
    val sourceNodeId: String,
    val targetNodeId: String,
    val pairingId: String,
    val cursor: String,
    val limit: Int
) : SyncMessage {
    override val messageType: SyncMessageType =
        SyncMessageType.SYNC_REQUEST

    override fun toStableMap(): Map<String, Any?> = linkedMapOf(
        "message_type" to messageType.wireValue,
        "protocol_version" to protocolVersion,
        "session_id" to sessionId,
        "source_node_id" to sourceNodeId,
        "target_node_id" to targetNodeId,
        "pairing_id" to pairingId,
        "cursor" to cursor,
        "limit" to limit
    )
}

data class SyncBatch(
    override val protocolVersion: String,
    val sessionId: String,
    val sourceNodeId: String,
    val targetNodeId: String,
    val pairingId: String,
    val requestCursor: String,
    val nextCursor: String,
    val hasMore: Boolean,
    val packets: List<LmpPacket<PacketPayload>>
) : SyncMessage {
    override val messageType: SyncMessageType =
        SyncMessageType.SYNC_BATCH

    override fun toStableMap(): Map<String, Any?> = linkedMapOf(
        "message_type" to messageType.wireValue,
        "protocol_version" to protocolVersion,
        "session_id" to sessionId,
        "source_node_id" to sourceNodeId,
        "target_node_id" to targetNodeId,
        "pairing_id" to pairingId,
        "request_cursor" to requestCursor,
        "next_cursor" to nextCursor,
        "has_more" to hasMore,
        "packets" to packets.map { it.toStableMap() }
    )
}

data class SyncReject(
    override val protocolVersion: String,
    val sessionId: String,
    val sourceNodeId: String,
    val targetNodeId: String,
    val pairingId: String,
    val reasonCode: SyncRejectReason
) : SyncMessage {
    override val messageType: SyncMessageType =
        SyncMessageType.SYNC_REJECT

    override fun toStableMap(): Map<String, Any?> = linkedMapOf(
        "message_type" to messageType.wireValue,
        "protocol_version" to protocolVersion,
        "session_id" to sessionId,
        "source_node_id" to sourceNodeId,
        "target_node_id" to targetNodeId,
        "pairing_id" to pairingId,
        "reason_code" to reasonCode.wireValue
    )
}

data class DecodedSyncCursor(
    val receivedAt: Long,
    val packetId: String
)

class SyncProtocolException(
    val reason: SyncRejectReason,
    message: String
) : IllegalArgumentException(message)

object SyncProtocol {
    fun clampLimit(limit: Int): Int =
        limit.coerceIn(1, MAX_PACKETS_PER_SYNC_BATCH)

    fun cursorFor(receivedAt: Long, packetId: String): String {
        if (receivedAt < 0L) {
            reject(
                SyncRejectReason.INVALID_CURSOR,
                "Sync cursor received_at must not be negative"
            )
        }
        if (packetId.contains('\n') || packetId.contains('\r')) {
            reject(
                SyncRejectReason.INVALID_CURSOR,
                "Sync cursor packet_id contains a line break"
            )
        }
        return "$receivedAt:$packetId"
    }

    fun decodeCursor(cursor: String): DecodedSyncCursor {
        val separator = cursor.indexOf(':')
        if (separator < 1) {
            reject(
                SyncRejectReason.INVALID_CURSOR,
                "Sync cursor must use received_at:packet_id format"
            )
        }

        val receivedAtText = cursor.substring(0, separator)
        val receivedAt = receivedAtText.toLongOrNull()
            ?: reject(
                SyncRejectReason.INVALID_CURSOR,
                "Sync cursor received_at is not an integer"
            )
        if (receivedAt < 0L) {
            reject(
                SyncRejectReason.INVALID_CURSOR,
                "Sync cursor received_at must not be negative"
            )
        }

        val packetId = cursor.substring(separator + 1)
        if (packetId.contains('\n') || packetId.contains('\r')) {
            reject(
                SyncRejectReason.INVALID_CURSOR,
                "Sync cursor packet_id contains a line break"
            )
        }

        return DecodedSyncCursor(
            receivedAt = receivedAt,
            packetId = packetId
        )
    }

    fun compareCursors(left: String, right: String): Int {
        val leftCursor = decodeCursor(left)
        val rightCursor = decodeCursor(right)

        return when {
            leftCursor.receivedAt < rightCursor.receivedAt -> -1
            leftCursor.receivedAt > rightCursor.receivedAt -> 1
            leftCursor.packetId < rightCursor.packetId -> -1
            leftCursor.packetId > rightCursor.packetId -> 1
            else -> 0
        }
    }

    fun createRequest(
        session: ConnectionSession,
        cursor: String,
        limit: Int
    ): SyncRequest {
        requireConnectedSession(session)
        val request = SyncRequest(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = session.sessionId,
            sourceNodeId = session.localNodeId,
            targetNodeId = session.remoteNodeId,
            pairingId = session.pairingId,
            cursor = cursor,
            limit = clampLimit(limit)
        )
        validateRequest(request)
        return request
    }

    fun createBatch(
        request: SyncRequest,
        packets: List<LmpPacket<PacketPayload>>,
        nextCursor: String,
        hasMore: Boolean
    ): SyncBatch {
        val batch = SyncBatch(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = request.sessionId,
            sourceNodeId = request.targetNodeId,
            targetNodeId = request.sourceNodeId,
            pairingId = request.pairingId,
            requestCursor = request.cursor,
            nextCursor = nextCursor,
            hasMore = hasMore,
            packets = packets
        )
        validateBatch(batch)
        return batch
    }

    fun createRejectForRequest(
        request: SyncRequest,
        reason: SyncRejectReason
    ): SyncReject {
        val reject = SyncReject(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = request.sessionId,
            sourceNodeId = request.targetNodeId,
            targetNodeId = request.sourceNodeId,
            pairingId = request.pairingId,
            reasonCode = reason
        )
        validateReject(reject)
        return reject
    }

    fun validateRequest(request: SyncRequest) {
        requireProtocolVersion(request.protocolVersion)
        validateSessionId(request.sessionId)
        requireNodeId(request.sourceNodeId, "source_node_id")
        requireNodeId(request.targetNodeId, "target_node_id")
        requireDifferentNodes(request.sourceNodeId, request.targetNodeId)
        requireNonBlank(request.pairingId, "pairing_id")
        decodeCursor(request.cursor)
        if (request.limit <= 0) {
            reject(
                SyncRejectReason.INVALID_LIMIT,
                "Sync request limit must be positive"
            )
        }
    }

    fun validateRequestForClient(
        request: SyncRequest,
        session: ConnectionSession
    ) {
        validateRequest(request)
        requireConnectedSession(session)
        validateSessionDirection(
            session = session,
            sessionId = request.sessionId,
            sourceNodeId = request.sourceNodeId,
            targetNodeId = request.targetNodeId,
            pairingId = request.pairingId,
            sourceIsLocal = true
        )
    }

    fun validateRequestForResponder(
        request: SyncRequest,
        session: ConnectionSession
    ) {
        validateRequest(request)
        requireConnectedSession(session)
        validateSessionDirection(
            session = session,
            sessionId = request.sessionId,
            sourceNodeId = request.sourceNodeId,
            targetNodeId = request.targetNodeId,
            pairingId = request.pairingId,
            sourceIsLocal = false
        )
    }

    fun validateBatch(batch: SyncBatch) {
        requireProtocolVersion(batch.protocolVersion)
        validateSessionId(batch.sessionId)
        requireNodeId(batch.sourceNodeId, "source_node_id")
        requireNodeId(batch.targetNodeId, "target_node_id")
        requireDifferentNodes(batch.sourceNodeId, batch.targetNodeId)
        requireNonBlank(batch.pairingId, "pairing_id")
        decodeCursor(batch.requestCursor)
        decodeCursor(batch.nextCursor)

        if (batch.packets.size > MAX_PACKETS_PER_SYNC_BATCH) {
            reject(
                SyncRejectReason.BATCH_TOO_LARGE,
                "Sync batch contains ${batch.packets.size} packets; " +
                    "maximum is $MAX_PACKETS_PER_SYNC_BATCH"
            )
        }

        if (batch.hasMore && batch.nextCursor == batch.requestCursor) {
            reject(
                SyncRejectReason.CURSOR_STALLED,
                "Sync batch has_more=true but next_cursor did not advance"
            )
        }

        if (compareCursors(batch.nextCursor, batch.requestCursor) < 0) {
            reject(
                SyncRejectReason.CURSOR_REGRESSION,
                "Sync batch next_cursor moved backwards"
            )
        }

        val encodedBytes = encodedByteSize(batch)
        if (encodedBytes > MAX_SYNC_BATCH_BYTES) {
            reject(
                SyncRejectReason.BATCH_TOO_LARGE,
                "Sync batch is $encodedBytes bytes; maximum is " +
                    "$MAX_SYNC_BATCH_BYTES"
            )
        }
    }

    fun validateBatchForClient(
        batch: SyncBatch,
        session: ConnectionSession
    ) {
        validateBatch(batch)
        requireConnectedSession(session)
        validateSessionDirection(
            session = session,
            sessionId = batch.sessionId,
            sourceNodeId = batch.sourceNodeId,
            targetNodeId = batch.targetNodeId,
            pairingId = batch.pairingId,
            sourceIsLocal = false
        )
    }

    fun validateReject(reject: SyncReject) {
        requireProtocolVersion(reject.protocolVersion)
        validateSessionId(reject.sessionId)
        requireNodeId(reject.sourceNodeId, "source_node_id")
        requireNodeId(reject.targetNodeId, "target_node_id")
        requireDifferentNodes(reject.sourceNodeId, reject.targetNodeId)
        requireNonBlank(reject.pairingId, "pairing_id")
    }

    fun validateRejectForClient(
        reject: SyncReject,
        session: ConnectionSession
    ) {
        validateReject(reject)
        requireConnectedSession(session)
        validateSessionDirection(
            session = session,
            sessionId = reject.sessionId,
            sourceNodeId = reject.sourceNodeId,
            targetNodeId = reject.targetNodeId,
            pairingId = reject.pairingId,
            sourceIsLocal = false
        )
    }

    fun encodedByteSize(batch: SyncBatch): Int =
        SyncJsonCodec.encodeUnvalidated(batch)
            .toByteArray(StandardCharsets.UTF_8)
            .size

    private fun validateSessionId(sessionId: String) {
        try {
            ConnectionProtocol.validateSessionId(sessionId)
        } catch (error: IllegalArgumentException) {
            reject(
                SyncRejectReason.INVALID_MESSAGE,
                error.message ?: "Malformed sync session_id"
            )
        }
    }

    private fun validateSessionDirection(
        session: ConnectionSession,
        sessionId: String,
        sourceNodeId: String,
        targetNodeId: String,
        pairingId: String,
        sourceIsLocal: Boolean
    ) {
        if (sessionId != session.sessionId) {
            reject(
                SyncRejectReason.SESSION_MISMATCH,
                "Sync session_id does not match the handshaken session"
            )
        }

        val expectedSource = if (sourceIsLocal) {
            session.localNodeId
        } else {
            session.remoteNodeId
        }
        val expectedTarget = if (sourceIsLocal) {
            session.remoteNodeId
        } else {
            session.localNodeId
        }

        if (sourceNodeId != expectedSource) {
            reject(
                SyncRejectReason.NODE_ID_MISMATCH,
                "Sync source_node_id does not match the handshaken direction"
            )
        }
        if (targetNodeId != expectedTarget) {
            reject(
                SyncRejectReason.TARGET_NODE_MISMATCH,
                "Sync target_node_id does not match the handshaken direction"
            )
        }
        if (pairingId != session.pairingId) {
            reject(
                SyncRejectReason.PAIRING_MISMATCH,
                "Sync pairing_id does not match the handshaken session"
            )
        }
    }

    private fun requireConnectedSession(session: ConnectionSession) {
        if (session.state != ConnectionSessionState.CONNECTED) {
            reject(
                SyncRejectReason.SESSION_MISMATCH,
                "Sync requires a successfully handshaken session"
            )
        }
    }

    private fun requireProtocolVersion(version: String) {
        if (version != SYNC_PROTOCOL_VERSION) {
            reject(
                SyncRejectReason.INVALID_MESSAGE,
                "Unsupported sync protocol version: $version"
            )
        }
    }

    private fun requireNodeId(value: String, fieldName: String) {
        if (value.trim().isEmpty()) {
            reject(
                SyncRejectReason.NODE_ID_MISMATCH,
                "$fieldName must be a non-empty string"
            )
        }
    }

    private fun requireDifferentNodes(sourceNodeId: String, targetNodeId: String) {
        if (sourceNodeId == targetNodeId) {
            reject(
                SyncRejectReason.NODE_ID_MISMATCH,
                "Sync source_node_id must differ from target_node_id"
            )
        }
    }

    private fun requireNonBlank(value: String, fieldName: String) {
        if (value.trim().isEmpty()) {
            reject(
                SyncRejectReason.INVALID_MESSAGE,
                "$fieldName must be a non-empty string"
            )
        }
    }

    private fun reject(
        reason: SyncRejectReason,
        message: String
    ): Nothing = throw SyncProtocolException(reason, message)
}

fun SyncMessage.toCanonicalJson(): String =
    StableJson.stringify(toStableMap())
