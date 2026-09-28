package org.daovibe.android.core.connection

import android.util.Base64
import org.daovibe.android.core.protocol.StableJson
import org.daovibe.android.core.protocol.sha256
import org.json.JSONObject
import java.nio.charset.StandardCharsets

const val PEER_INVITE_VERSION = 1
const val PEER_INVITE_SCHEME = "daovibe://peer-invite"
const val MAX_PEER_INVITE_BYTES = 4096
const val MAX_PEER_INVITE_TEXT_LENGTH = 8192

data class PeerInvite(
    val inviteVersion: Int = PEER_INVITE_VERSION,
    val sourceNodeId: String,
    val sourceDisplayName: String? = null,
    val host: String,
    val port: Int,
    val pairingId: String,
    val createdAt: Long,
    val expiresAt: Long,
    val connectionVersion: String = CONNECTION_PROTOCOL_VERSION,
    val packetProtocolVersion: String = org.daovibe.android.core.protocol.LMP_VERSION,
    val capabilities: List<String>? = null,
    val note: String? = null
) {
    fun canonicalJson(): String = StableJson.stringify(toStableMap())
    fun inviteId(): String = sha256(canonicalJson())
    fun toStableMap(): Map<String, Any?> = linkedMapOf(
        "invite_version" to inviteVersion,
        "source_node_id" to sourceNodeId,
        "source_display_name" to sourceDisplayName,
        "host" to host,
        "port" to port,
        "pairing_id" to pairingId,
        "created_at" to createdAt,
        "expires_at" to expiresAt,
        "connection_version" to connectionVersion,
        "packet_protocol_version" to packetProtocolVersion,
        "capabilities" to capabilities?.sorted(),
        "note" to note
    ).filterValues { it != null }
}

object PeerInviteCodec {
    fun encode(invite: PeerInvite): String {
        validate(invite, nowSeconds = invite.createdAt)
        return invite.canonicalJson()
    }

    fun decodeCanonical(json: String, nowSeconds: Long): PeerInvite {
        require(json.toByteArray(StandardCharsets.UTF_8).size <= MAX_PEER_INVITE_BYTES) {
            "invite payload is oversized"
        }
        val objectValue = JSONObject(json)
        val allowed = setOf(
            "invite_version", "source_node_id", "source_display_name", "host", "port",
            "pairing_id", "created_at", "expires_at", "connection_version",
            "packet_protocol_version", "capabilities", "note"
        )
        objectValue.keys().forEach { require(it in allowed) { "unknown invite field: $it" } }
        val invite = PeerInvite(
            inviteVersion = objectValue.getInt("invite_version"),
            sourceNodeId = objectValue.getString("source_node_id"),
            sourceDisplayName = optionalString(objectValue, "source_display_name"),
            host = objectValue.getString("host"),
            port = objectValue.getInt("port"),
            pairingId = objectValue.getString("pairing_id"),
            createdAt = objectValue.getLong("created_at"),
            expiresAt = objectValue.getLong("expires_at"),
            connectionVersion = objectValue.getString("connection_version"),
            packetProtocolVersion = objectValue.getString("packet_protocol_version"),
            capabilities = objectValue.optJSONArray("capabilities")?.let { array ->
                List(array.length()) { index -> array.getString(index) }
            },
            note = optionalString(objectValue, "note")
        )
        validate(invite, nowSeconds)
        return invite
    }

    fun encodePayload(invite: PeerInvite): String {
        val canonical = encode(invite)
        val bytes = canonical.toByteArray(StandardCharsets.UTF_8)
        require(bytes.size <= MAX_PEER_INVITE_BYTES) { "invite payload is oversized" }
        val data = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        return "$PEER_INVITE_SCHEME?v=$PEER_INVITE_VERSION&data=$data"
    }

    fun decodePayload(payload: String, nowSeconds: Long): PeerInvite {
        require(payload.length <= MAX_PEER_INVITE_TEXT_LENGTH) { "invite text is oversized" }
        val prefix = "$PEER_INVITE_SCHEME?v=$PEER_INVITE_VERSION&data="
        require(payload.startsWith(prefix)) { "unsupported or malformed invite payload" }
        val encoded = payload.removePrefix(prefix)
        require(encoded.isNotEmpty() && encoded.all { it.isLetterOrDigit() || it == '-' || it == '_' }) {
            "malformed invite encoding"
        }
        require(encoded.length % 4 != 1) { "malformed invite encoding" }
        val decoded = runCatching { Base64.decode(encoded, Base64.URL_SAFE or Base64.NO_WRAP) }
            .getOrElse { throw IllegalArgumentException("malformed invite encoding", it) }
        val recoded = Base64.encodeToString(decoded, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        require(recoded == encoded) { "non-canonical invite encoding" }
        require(decoded.size <= MAX_PEER_INVITE_BYTES) { "invite payload is oversized" }
        val json = String(decoded, StandardCharsets.UTF_8)
        val invite = decodeCanonical(json, nowSeconds)
        require(invite.canonicalJson() == json) { "non-canonical invite encoding" }
        return invite
    }

    fun validate(invite: PeerInvite, nowSeconds: Long) {
        require(invite.inviteVersion == PEER_INVITE_VERSION) { "unsupported invite version" }
        requireBounded(invite.sourceNodeId, "source_node_id", 256)
        requireBounded(invite.host, "host", 255)
        requireBounded(invite.pairingId, "pairing_id", 256)
        require(invite.port in 1..65535) { "port must be between 1 and 65535" }
        require(invite.createdAt > 0 && invite.expiresAt >= invite.createdAt) { "invalid invite timestamps" }
        require(nowSeconds < invite.expiresAt) { "invite is expired" }
        require(invite.connectionVersion in SUPPORTED_CONNECTION_VERSIONS) { "unsupported connection version" }
        require(invite.packetProtocolVersion in SUPPORTED_PACKET_PROTOCOL_VERSIONS) { "unsupported packet protocol version" }
        invite.sourceDisplayName?.let { requireBounded(it, "source_display_name", 128) }
        invite.note?.let { requireBounded(it, "note", 256) }
        invite.capabilities?.let {
            require(it.size <= 16 && it.all { value -> value.isNotBlank() && value.length <= 64 }) {
                "invalid capabilities"
            }
        }
    }

    private fun requireBounded(value: String, field: String, max: Int) {
        require(value.trim().isNotEmpty()) { "$field must not be blank" }
        require(value.length <= max) { "$field is too long" }
    }

    private fun optionalString(value: JSONObject, key: String): String? =
        if (value.has(key) && !value.isNull(key)) value.getString(key) else null
}
