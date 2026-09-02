package org.daovibe.android.core.protocol

const val LMP_VERSION = "lmp/0.1"
const val DEV_SIGNATURE_PREFIX = "dev_signature"
const val LEGACY_DEV_SIGNATURE_PLACEHOLDER = "dev_signature_placeholder"

data class LmpPacket<out TPayload : PacketPayload>(
    val version: String,
    val packetId: String,
    val packetType: PacketType,
    val createdAt: Long,
    val expiresAt: Long? = null,
    val zone: String,
    val author: String,
    val parent: String? = null,
    val payloadHash: String,
    val payload: TPayload,
    val signature: String
) {
    fun hashInputMap(): Map<String, Any?> = packetHashInputMap(
        version = version,
        packetType = packetType,
        createdAt = createdAt,
        expiresAt = expiresAt,
        zone = zone,
        author = author,
        parent = parent,
        payloadHash = payloadHash,
        payload = payload
    )

    fun signatureInputMap(): Map<String, Any?> {
        val map = linkedMapOf<String, Any?>(
            "version" to version,
            "packet_id" to packetId,
            "packet_type" to packetType.wireValue,
            "created_at" to createdAt
        )
        if (expiresAt != null) map["expires_at"] = expiresAt
        map["zone"] = zone
        map["author"] = author
        if (parent != null) map["parent"] = parent
        map["payload_hash"] = payloadHash
        return map
    }

    fun toStableMap(): Map<String, Any?> {
        val map = linkedMapOf<String, Any?>(
            "version" to version,
            "packet_id" to packetId,
            "packet_type" to packetType.wireValue,
            "created_at" to createdAt
        )
        if (expiresAt != null) map["expires_at"] = expiresAt
        map["zone"] = zone
        map["author"] = author
        if (parent != null) map["parent"] = parent
        map["payload_hash"] = payloadHash
        map["payload"] = payload.toStableMap()
        map["signature"] = signature
        return map
    }
}

fun packetHashInputMap(
    version: String,
    packetType: PacketType,
    createdAt: Long,
    expiresAt: Long?,
    zone: String,
    author: String,
    parent: String?,
    payloadHash: String,
    payload: PacketPayload
): Map<String, Any?> {
    val map = linkedMapOf<String, Any?>(
        "version" to version,
        "packet_type" to packetType.wireValue,
        "created_at" to createdAt
    )
    if (expiresAt != null) map["expires_at"] = expiresAt
    map["zone"] = zone
    map["author"] = author
    if (parent != null) map["parent"] = parent
    map["payload_hash"] = payloadHash
    map["payload"] = payload.toStableMap()
    return map
}

fun createDevSignature(author: String, packetId: String): String =
    "$DEV_SIGNATURE_PREFIX:$author:$packetId"

