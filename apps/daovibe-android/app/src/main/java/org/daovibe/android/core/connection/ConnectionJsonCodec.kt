package org.daovibe.android.core.connection

import org.json.JSONObject

object ConnectionJsonCodec {
    fun encode(message: ConnectionMessage): String {
        when (message) {
            is ConnectionHello -> ConnectionProtocol.validateHello(message)
            is ConnectionAccept -> ConnectionProtocol.validateAccept(message)
            is ConnectionReject -> ConnectionProtocol.validateReject(message)
        }
        return message.toCanonicalJson()
    }

    fun decode(json: String): ConnectionMessage =
        decode(JSONObject(json))

    fun decode(json: JSONObject): ConnectionMessage {
        return when (
            ConnectionMessageType.fromWireValue(json.getString("message_type"))
        ) {
            ConnectionMessageType.CONNECTION_HELLO -> decodeHello(json)
            ConnectionMessageType.CONNECTION_ACCEPT -> decodeAccept(json)
            ConnectionMessageType.CONNECTION_REJECT -> decodeReject(json)
            null -> error("Unsupported connection message type")
        }
    }

    fun decodeHello(json: String): ConnectionHello =
        decodeHello(JSONObject(json))

    fun decodeHello(json: JSONObject): ConnectionHello {
        val hello = ConnectionHello(
            protocolVersion = json.getString("protocol_version"),
            sessionId = json.getString("session_id"),
            sourceNodeId = json.getString("source_node_id"),
            targetNodeId = json.getString("target_node_id"),
            sourcePlatform = json.getString("source_platform"),
            sourceRole = json.getString("source_role"),
            pairingId = json.getString("pairing_id"),
            createdAt = json.getLong("created_at"),
            supportedConnectionVersions = json.stringSet(
                "supported_connection_versions"
            ),
            supportedPacketProtocolVersions = json.stringSet(
                "supported_packet_protocol_versions"
            ),
            capabilities = json.capabilitySet("capabilities")
        )
        ConnectionProtocol.validateHello(hello)
        return hello
    }

    fun decodeAccept(json: String): ConnectionAccept =
        decodeAccept(JSONObject(json))

    fun decodeAccept(json: JSONObject): ConnectionAccept {
        val accept = ConnectionAccept(
            protocolVersion = json.getString("protocol_version"),
            sessionId = json.getString("session_id"),
            sourceNodeId = json.getString("source_node_id"),
            targetNodeId = json.getString("target_node_id"),
            pairingId = json.getString("pairing_id"),
            acceptedAt = json.getLong("accepted_at"),
            negotiatedConnectionVersion = json.getString(
                "negotiated_connection_version"
            ),
            negotiatedPacketProtocolVersion = json.getString(
                "negotiated_packet_protocol_version"
            ),
            capabilities = json.capabilitySet("capabilities"),
            state = ConnectionSessionState.fromWireValue(
                json.getString("state")
            ) ?: error("Invalid connection state")
        )
        ConnectionProtocol.validateAccept(accept)
        return accept
    }

    fun decodeReject(json: String): ConnectionReject =
        decodeReject(JSONObject(json))

    fun decodeReject(json: JSONObject): ConnectionReject {
        val reject = ConnectionReject(
            protocolVersion = json.getString("protocol_version"),
            sessionId = json.getString("session_id"),
            sourceNodeId = json.getString("source_node_id"),
            targetNodeId = json.getString("target_node_id"),
            pairingId = json.getString("pairing_id"),
            rejectedAt = json.getLong("rejected_at"),
            reasonCode = ConnectionRejectReason.fromWireValue(
                json.getString("reason_code")
            ) ?: error("Invalid reason_code")
        )
        ConnectionProtocol.validateReject(reject)
        return reject
    }

    private fun JSONObject.stringSet(name: String): Set<String> {
        val array = getJSONArray(name)
        val values = linkedSetOf<String>()
        for (index in 0 until array.length()) {
            val value = array.getString(index)
            require(value.trim().isNotEmpty()) {
                "$name must contain non-empty strings"
            }
            require(values.add(value)) {
                "$name must not contain duplicates"
            }
        }
        return values
    }

    private fun JSONObject.capabilitySet(
        name: String
    ): Set<ConnectionCapability> {
        val array = getJSONArray(name)
        val values = linkedSetOf<ConnectionCapability>()
        for (index in 0 until array.length()) {
            val wireValue = array.getString(index)
            val capability = ConnectionCapability.fromWireValue(wireValue)
                ?: error("Invalid capability: $wireValue")
            require(values.add(capability)) {
                "$name must not contain duplicates"
            }
        }
        return values
    }
}
