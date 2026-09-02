package org.daovibe.android.core.storage

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "device_identity")
data class DeviceIdentityEntity(
    @PrimaryKey val id: Int,
    @ColumnInfo(name = "node_id") val nodeId: String,
    @ColumnInfo(name = "display_name") val displayName: String,
    @ColumnInfo(name = "created_at") val createdAt: Long
)

@Entity(
    tableName = "packets",
    indices = [
        Index(value = ["phrase_id"]),
        Index(value = ["meaning_id"]),
        Index(value = ["packet_type"]),
        Index(value = ["zone"]),
        Index(value = ["received_at", "packet_id"])
    ]
)
data class PacketEntity(
    @PrimaryKey
    @ColumnInfo(name = "packet_id")
    val packetId: String,
    @ColumnInfo(name = "packet_type")
    val packetType: String,
    val zone: String,
    val author: String,
    val parent: String?,
    @ColumnInfo(name = "phrase_id")
    val phraseId: String?,
    @ColumnInfo(name = "meaning_id")
    val meaningId: String?,
    @ColumnInfo(name = "payload_hash")
    val payloadHash: String,
    @ColumnInfo(name = "payload_json")
    val payloadJson: String,
    @ColumnInfo(name = "packet_json")
    val packetJson: String,
    @ColumnInfo(name = "packet_size_bytes")
    val packetSizeBytes: Int,
    @ColumnInfo(name = "packet_size_class")
    val packetSizeClass: String,
    @ColumnInfo(name = "size_recommendation")
    val sizeRecommendation: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "received_at")
    val receivedAt: Long
)

@Entity(tableName = "phrases")
data class PhraseEntity(
    @PrimaryKey
    @ColumnInfo(name = "phrase_id")
    val phraseId: String,
    @ColumnInfo(name = "surface_text")
    val surfaceText: String?,
    @ColumnInfo(name = "phonetic_hint")
    val phoneticHint: String?,
    @ColumnInfo(name = "language_hint")
    val languageHint: String?,
    @ColumnInfo(name = "safety_label")
    val safetyLabel: String,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)

@Entity(
    tableName = "meanings",
    indices = [Index(value = ["phrase_id"])]
)
data class MeaningEntity(
    @PrimaryKey
    @ColumnInfo(name = "meaning_id")
    val meaningId: String,
    @ColumnInfo(name = "phrase_id")
    val phraseId: String,
    @ColumnInfo(name = "reference_meaning")
    val referenceMeaning: String,
    val context: String?,
    val confidence: Double,
    val confirms: Double,
    val rejects: Double,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)

@Entity(
    tableName = "votes",
    indices = [
        Index(value = ["phrase_id"]),
        Index(value = ["meaning_id"]),
        Index(value = ["author"])
    ]
)
data class VoteEntity(
    @PrimaryKey
    @ColumnInfo(name = "vote_packet_id")
    val votePacketId: String,
    @ColumnInfo(name = "phrase_id")
    val phraseId: String,
    @ColumnInfo(name = "meaning_id")
    val meaningId: String,
    val vote: String,
    val confidence: Double,
    val author: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long
)

@Entity(tableName = "peer_sync_cursors")
data class SyncCursorEntity(
    @PrimaryKey
    @ColumnInfo(name = "peer_author")
    val peerAuthor: String,
    val cursor: String,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)

