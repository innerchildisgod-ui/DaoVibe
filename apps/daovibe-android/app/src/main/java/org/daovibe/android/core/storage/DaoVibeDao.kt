package org.daovibe.android.core.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface DaoVibeDao {
    @Query("SELECT * FROM device_identity WHERE id = 1 LIMIT 1")
    suspend fun getDeviceIdentity(): DeviceIdentityEntity?

    @Query("SELECT * FROM device_identity WHERE id = 1 LIMIT 1")
    fun observeDeviceIdentity(): Flow<DeviceIdentityEntity?>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertDeviceIdentity(identity: DeviceIdentityEntity): Long

    @Query("UPDATE device_identity SET display_name = :displayName WHERE id = 1")
    suspend fun updateDeviceDisplayName(displayName: String)

    @Query("SELECT COUNT(*) FROM packets WHERE packet_id = :packetId")
    suspend fun packetCountById(packetId: String): Int

    @Query("SELECT * FROM packets WHERE packet_id = :packetId LIMIT 1")
    suspend fun getPacketById(packetId: String): PacketEntity?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertPacket(packet: PacketEntity): Long

    @Query("SELECT * FROM packets ORDER BY received_at DESC, packet_id ASC LIMIT :limit")
    fun observeRecentPackets(limit: Int): Flow<List<PacketEntity>>

    @Query("SELECT * FROM packets ORDER BY received_at ASC, packet_id ASC")
    suspend fun listPacketsInLedgerOrder(): List<PacketEntity>

    @Query(
        """
        SELECT * FROM packets
        WHERE
          received_at > :receivedAt
          OR (
            received_at = :receivedAt
            AND packet_id > :packetId
          )
        ORDER BY received_at ASC, packet_id ASC
        LIMIT :limit
        """
    )
    suspend fun listPacketsAfterCursor(
        receivedAt: Long,
        packetId: String,
        limit: Int
    ): List<PacketEntity>

    @Query("SELECT * FROM packets WHERE packet_id IN (:packetIds)")
    suspend fun listPacketsByIds(packetIds: List<String>): List<PacketEntity>

    @Query("SELECT * FROM packets ORDER BY received_at ASC, packet_id ASC")
    fun observePacketsInLedgerOrder(): Flow<List<PacketEntity>>

    @Query("SELECT * FROM packets ORDER BY created_at ASC, packet_id ASC")
    suspend fun listPacketsForReplay(): List<PacketEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertPhrase(phrase: PhraseEntity): Long

    @Query(
        """
        UPDATE phrases
        SET
          surface_text = COALESCE(:surfaceText, surface_text),
          phonetic_hint = COALESCE(:phoneticHint, phonetic_hint),
          language_hint = COALESCE(:languageHint, language_hint),
          safety_label = CASE
            WHEN safety_label != 'normal' AND :safetyLabel = 'normal'
            THEN safety_label
            ELSE :safetyLabel
          END,
          updated_at = :updatedAt
        WHERE phrase_id = :phraseId
        """
    )
    suspend fun mergePhrase(
        phraseId: String,
        surfaceText: String?,
        phoneticHint: String?,
        languageHint: String?,
        safetyLabel: String,
        updatedAt: Long
    )

    @Query("SELECT COUNT(*) FROM phrases WHERE phrase_id = :phraseId")
    suspend fun phraseCountById(phraseId: String): Int

    @Query("UPDATE phrases SET safety_label = :label, updated_at = :updatedAt WHERE phrase_id = :phraseId")
    suspend fun updateSafetyLabel(phraseId: String, label: String, updatedAt: Long)

    @Query("SELECT * FROM phrases ORDER BY updated_at DESC, phrase_id ASC")
    fun observePhrases(): Flow<List<PhraseEntity>>

    @Query("SELECT * FROM phrases ORDER BY updated_at DESC, phrase_id ASC")
    suspend fun listPhrases(): List<PhraseEntity>

    @Query("DELETE FROM phrases")
    suspend fun clearPhrases()

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertMeaning(meaning: MeaningEntity): Long

    @Query("SELECT COUNT(*) FROM meanings WHERE meaning_id = :meaningId")
    suspend fun meaningCountById(meaningId: String): Int

    @Query("SELECT * FROM meanings ORDER BY meaning_id ASC")
    fun observeMeanings(): Flow<List<MeaningEntity>>

    @Query("SELECT * FROM meanings ORDER BY meaning_id ASC")
    suspend fun listMeanings(): List<MeaningEntity>

    @Query("DELETE FROM meanings")
    suspend fun clearMeanings()

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertVote(vote: VoteEntity): Long

    @Query("SELECT * FROM votes ORDER BY created_at ASC, vote_packet_id ASC")
    fun observeVotes(): Flow<List<VoteEntity>>

    @Query("SELECT * FROM votes ORDER BY created_at ASC, vote_packet_id ASC")
    suspend fun listVotes(): List<VoteEntity>

    @Query("DELETE FROM votes")
    suspend fun clearVotes()

    @Query(
        "SELECT * FROM peer_sync_state " +
            "WHERE remote_node_id = :remoteNodeId LIMIT 1"
    )
    suspend fun getPeerSyncState(remoteNodeId: String): PeerSyncStateEntity?

    @Query(
        "SELECT * FROM peer_sync_state " +
            "ORDER BY updated_at DESC, remote_node_id ASC"
    )
    suspend fun listPeerSyncStates(): List<PeerSyncStateEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPeerSyncState(state: PeerSyncStateEntity)

    @Query("SELECT * FROM known_peers ORDER BY remote_node_id ASC")
    fun observeKnownPeers(): Flow<List<KnownPeerEntity>>

    @Query("SELECT * FROM known_peers ORDER BY remote_node_id ASC")
    suspend fun listKnownPeers(): List<KnownPeerEntity>

    @Query("SELECT * FROM known_peers WHERE remote_node_id = :remoteNodeId LIMIT 1")
    suspend fun getKnownPeer(remoteNodeId: String): KnownPeerEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertKnownPeer(peer: KnownPeerEntity)

    @Query("DELETE FROM known_peers WHERE remote_node_id = :remoteNodeId")
    suspend fun deleteKnownPeer(remoteNodeId: String)

    @Query(
        "UPDATE known_peers SET last_successful_contact_at = :contactAt, " +
            "last_outcome = 'success', " +
            "last_stage = :stage, last_attempts = :attempts, " +
            "last_imported_packets = :importedPackets, last_duplicate_packets = :duplicatePackets, " +
            "last_exported_packets = :exportedPackets, last_sync_started_at = :startedAt, " +
            "last_sync_finished_at = :updatedAt, last_cursor = :cursor, updated_at = :updatedAt " +
            "WHERE remote_node_id = :remoteNodeId"
    )
    suspend fun markKnownPeerSuccess(
        remoteNodeId: String,
        contactAt: Long,
        updatedAt: Long,
        stage: String,
        attempts: Int,
        importedPackets: Int,
        duplicatePackets: Int,
        exportedPackets: Int?,
        startedAt: Long,
        cursor: String?
    )

    @Query(
        "UPDATE known_peers SET last_failure_at = :updatedAt, last_error = :error, " +
            "last_outcome = 'failed', last_stage = :stage, last_error_category = :category, " +
            "last_attempts = :attempts, last_imported_packets = :importedPackets, " +
            "last_duplicate_packets = :duplicatePackets, last_exported_packets = :exportedPackets, " +
            "last_sync_started_at = :startedAt, last_sync_finished_at = :updatedAt, " +
            "last_cursor = :cursor, updated_at = :updatedAt WHERE remote_node_id = :remoteNodeId"
    )
    suspend fun markKnownPeerFailure(
        remoteNodeId: String,
        error: String,
        updatedAt: Long,
        stage: String,
        category: String,
        attempts: Int,
        importedPackets: Int,
        duplicatePackets: Int,
        exportedPackets: Int?,
        startedAt: Long,
        cursor: String?
    )

    @Query(
        "SELECT * FROM paired_devices " +
            "ORDER BY updated_at DESC, pairing_id ASC"
    )
    fun observePairingRecords(): Flow<List<PairingRecordEntity>>

    @Query(
        "SELECT * FROM paired_devices " +
            "ORDER BY updated_at DESC, pairing_id ASC"
    )
    suspend fun listPairingRecords(): List<PairingRecordEntity>

    @Query("SELECT * FROM paired_devices WHERE pairing_id = :pairingId LIMIT 1")
    suspend fun getPairingRecord(pairingId: String): PairingRecordEntity?

    @Query(
        """
        SELECT * FROM paired_devices
        WHERE local_node_id = :localNodeId
          AND remote_node_id = :remoteNodeId
        ORDER BY updated_at DESC, pairing_id ASC
        LIMIT 1
        """
    )
    suspend fun getPairingRecordForRemote(
        localNodeId: String,
        remoteNodeId: String
    ): PairingRecordEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPairingRecord(record: PairingRecordEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPendingPairingOffer(offer: PendingPairingOfferEntity)

    @Query("SELECT * FROM pending_pairing_offers WHERE pairing_id = :pairingId LIMIT 1")
    suspend fun getPendingPairingOffer(pairingId: String): PendingPairingOfferEntity?
}
