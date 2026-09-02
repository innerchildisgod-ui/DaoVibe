package org.daovibe.android.core.protocol

class PacketFactory(
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L }
) {
    fun create(
        packetType: PacketType,
        zone: String,
        author: String,
        payload: PacketPayload,
        parent: String? = null,
        expiresAt: Long? = null,
        createdAt: Long = nowSeconds(),
        signature: String? = null
    ): LmpPacket<PacketPayload> {
        require(packetType == payload.packetType) {
            "Payload type ${payload.packetType.wireValue} does not match ${packetType.wireValue}"
        }

        val payloadHash = sha256(StableJson.stringify(payload.toStableMap()))
        val packetId = sha256(
            StableJson.stringify(
                packetHashInputMap(
                    version = LMP_VERSION,
                    packetType = packetType,
                    createdAt = createdAt,
                    expiresAt = expiresAt,
                    zone = zone,
                    author = author,
                    parent = parent,
                    payloadHash = payloadHash,
                    payload = payload
                )
            )
        )

        return LmpPacket(
            version = LMP_VERSION,
            packetId = packetId,
            packetType = packetType,
            createdAt = createdAt,
            expiresAt = expiresAt,
            zone = zone,
            author = author,
            parent = parent,
            payloadHash = payloadHash,
            payload = payload,
            signature = signature ?: createDevSignature(author, packetId)
        )
    }
}

