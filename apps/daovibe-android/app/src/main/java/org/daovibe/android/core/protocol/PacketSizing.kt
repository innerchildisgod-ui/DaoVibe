package org.daovibe.android.core.protocol

import java.nio.charset.StandardCharsets

enum class PacketSizeClass(val wireValue: String) {
    TINY("tiny"),
    SMALL("small"),
    MEDIUM("medium"),
    LARGE("large"),
    TOO_LARGE("too_large")
}

data class PacketSizeEstimate(
    val bytes: Int,
    val sizeClass: PacketSizeClass,
    val recommendation: String
)

fun estimatePacketSize(packet: LmpPacket<PacketPayload>): PacketSizeEstimate {
    val bytes = StableJson.stringify(packet.toStableMap())
        .toByteArray(StandardCharsets.UTF_8)
        .size

    return when {
        bytes <= 512 -> PacketSizeEstimate(bytes, PacketSizeClass.TINY, "send_now")
        bytes <= 2048 -> PacketSizeEstimate(bytes, PacketSizeClass.SMALL, "send_now")
        bytes <= 8192 -> PacketSizeEstimate(bytes, PacketSizeClass.MEDIUM, "batch")
        bytes <= 32768 -> PacketSizeEstimate(bytes, PacketSizeClass.LARGE, "send_header_only")
        else -> PacketSizeEstimate(bytes, PacketSizeClass.TOO_LARGE, "reject_or_store_only")
    }
}
