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

@Entity(
    tableName = "peer_sync_state",
    indices = [Index(value = ["pairing_id"])]
)
data class PeerSyncStateEntity(
    @PrimaryKey
    @ColumnInfo(name = "remote_node_id")
    val remoteNodeId: String,
    @ColumnInfo(name = "pairing_id")
    val pairingId: String,
    @ColumnInfo(name = "inbound_cursor")
    val inboundCursor: String,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)

/** Local transport configuration. This is deliberately not ledger or semantic state. */
@Entity(tableName = "known_peers")
data class KnownPeerEntity(
    @PrimaryKey @ColumnInfo(name = "remote_node_id") val remoteNodeId: String,
    @ColumnInfo(name = "display_name") val displayName: String?,
    val host: String,
    val port: Int,
    @ColumnInfo(name = "pairing_id") val pairingId: String,
    @ColumnInfo(name = "last_successful_contact_at") val lastSuccessfulContactAt: Long?,
    @ColumnInfo(name = "last_error") val lastError: String?,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    @ColumnInfo(name = "last_failure_at") val lastFailureAt: Long? = null,
    @ColumnInfo(name = "last_outcome") val lastOutcome: String? = null,
    @ColumnInfo(name = "last_stage") val lastStage: String? = null,
    @ColumnInfo(name = "last_error_category") val lastErrorCategory: String? = null,
    @ColumnInfo(name = "last_attempts") val lastAttempts: Int? = null,
    @ColumnInfo(name = "last_imported_packets") val lastImportedPackets: Int? = null,
    @ColumnInfo(name = "last_duplicate_packets") val lastDuplicatePackets: Int? = null,
    @ColumnInfo(name = "last_exported_packets") val lastExportedPackets: Int? = null,
    @ColumnInfo(name = "last_sync_started_at") val lastSyncStartedAt: Long? = null,
    @ColumnInfo(name = "last_sync_finished_at") val lastSyncFinishedAt: Long? = null,
    @ColumnInfo(name = "last_cursor") val lastCursor: String? = null,
    @ColumnInfo(name = "last_diagnostic_at") val lastDiagnosticAt: Long? = null,
    @ColumnInfo(name = "last_diagnostic_outcome") val lastDiagnosticOutcome: String? = null,
    @ColumnInfo(name = "last_diagnostic_stage") val lastDiagnosticStage: String? = null,
    @ColumnInfo(name = "last_diagnostic_error_category") val lastDiagnosticErrorCategory: String? = null,
    @ColumnInfo(name = "last_diagnostic_message") val lastDiagnosticMessage: String? = null,
    @ColumnInfo(name = "last_diagnostic_latency_ms") val lastDiagnosticLatencyMs: Long? = null
)

@Entity(
    tableName = "paired_devices",
    indices = [
        Index(value = ["local_node_id"]),
        Index(value = ["local_node_id", "remote_node_id"])
    ]
)
data class PairingRecordEntity(
    @PrimaryKey
    @ColumnInfo(name = "pairing_id")
    val pairingId: String,
    @ColumnInfo(name = "local_node_id")
    val localNodeId: String,
    @ColumnInfo(name = "remote_node_id")
    val remoteNodeId: String,
    @ColumnInfo(name = "remote_display_name")
    val remoteDisplayName: String,
    @ColumnInfo(name = "remote_platform")
    val remotePlatform: String,
    @ColumnInfo(name = "remote_role")
    val remoteRole: String,
    val status: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "paired_at")
    val pairedAt: Long?,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)

@Entity(tableName = "pending_pairing_offers")
data class PendingPairingOfferEntity(
    @PrimaryKey
    @ColumnInfo(name = "pairing_id")
    val pairingId: String,
    @ColumnInfo(name = "offer_json")
    val offerJson: String,
    @ColumnInfo(name = "local_node_id")
    val localNodeId: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
)
