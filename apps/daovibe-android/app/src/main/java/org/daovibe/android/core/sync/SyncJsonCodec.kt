package org.daovibe.android.core.sync

import org.daovibe.android.core.protocol.PacketJsonCodec
import org.json.JSONObject

object SyncJsonCodec {
    fun encode(message: SyncMessage): String {
        when (message) {
            is SyncRequest -> SyncProtocol.validateRequest(message)
            is SyncBatch -> SyncProtocol.validateBatch(message)
            is SyncReject -> SyncProtocol.validateReject(message)
        }
        return encodeUnvalidated(message)
    }

    internal fun encodeUnvalidated(message: SyncMessage): String =
        message.toCanonicalJson()

    fun decode(json: String): SyncMessage =
        decode(JSONObject(json))

    fun decode(json: JSONObject): SyncMessage {
        return when (
            SyncMessageType.fromWireValue(json.getString("message_type"))
        ) {
            SyncMessageType.SYNC_REQUEST -> decodeRequest(json)
            SyncMessageType.SYNC_BATCH -> decodeBatch(json)
            SyncMessageType.SYNC_REJECT -> decodeReject(json)
            null -> error("Unsupported sync message type")
        }
    }

    fun decodeRequest(json: String): SyncRequest =
        decodeRequest(JSONObject(json))

    fun decodeRequest(json: JSONObject): SyncRequest {
        val request = SyncRequest(
            protocolVersion = json.getString("protocol_version"),
            sessionId = json.getString("session_id"),
            sourceNodeId = json.getString("source_node_id"),
            targetNodeId = json.getString("target_node_id"),
            pairingId = json.getString("pairing_id"),
            cursor = json.getString("cursor"),
            limit = json.getInt("limit")
        )
        SyncProtocol.validateRequest(request)
        return request
    }

    fun decodeBatch(json: String): SyncBatch =
        decodeBatch(JSONObject(json))

    fun decodeBatch(json: JSONObject): SyncBatch {
        val packetArray = json.getJSONArray("packets")
        val packets = buildList {
            for (index in 0 until packetArray.length()) {
                add(PacketJsonCodec.decode(packetArray.getJSONObject(index)))
            }
        }
        val batch = SyncBatch(
            protocolVersion = json.getString("protocol_version"),
            sessionId = json.getString("session_id"),
            sourceNodeId = json.getString("source_node_id"),
            targetNodeId = json.getString("target_node_id"),
            pairingId = json.getString("pairing_id"),
            requestCursor = json.getString("request_cursor"),
            nextCursor = json.getString("next_cursor"),
            hasMore = json.getBoolean("has_more"),
            packets = packets
        )
        SyncProtocol.validateBatch(batch)
        return batch
    }

    fun decodeReject(json: String): SyncReject =
        decodeReject(JSONObject(json))

    fun decodeReject(json: JSONObject): SyncReject {
        val reject = SyncReject(
            protocolVersion = json.getString("protocol_version"),
            sessionId = json.getString("session_id"),
            sourceNodeId = json.getString("source_node_id"),
            targetNodeId = json.getString("target_node_id"),
            pairingId = json.getString("pairing_id"),
            reasonCode = SyncRejectReason.fromWireValue(
                json.getString("reason_code")
            ) ?: error("Invalid sync reason_code")
        )
        SyncProtocol.validateReject(reject)
        return reject
    }
}
