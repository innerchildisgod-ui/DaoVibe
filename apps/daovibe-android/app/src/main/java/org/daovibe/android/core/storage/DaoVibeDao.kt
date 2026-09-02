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

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertPacket(packet: PacketEntity): Long

    @Query("SELECT * FROM packets ORDER BY received_at DESC, packet_id ASC LIMIT :limit")
    fun observeRecentPackets(limit: Int): Flow<List<PacketEntity>>

    @Query("SELECT * FROM packets ORDER BY received_at ASC, packet_id ASC")
    suspend fun listPacketsInLedgerOrder(): List<PacketEntity>

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
}
