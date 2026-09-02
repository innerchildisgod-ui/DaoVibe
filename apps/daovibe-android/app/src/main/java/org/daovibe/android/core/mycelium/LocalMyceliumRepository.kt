package org.daovibe.android.core.mycelium

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import org.daovibe.android.core.identity.DeviceIdentityRepository
import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.MeaningProposalPayload
import org.daovibe.android.core.protocol.MeaningVotePayload
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PacketValidator
import org.daovibe.android.core.protocol.PhraseObservedPayload
import org.daovibe.android.core.protocol.SafetyLabel
import org.daovibe.android.core.protocol.SafetyLabelPayload
import org.daovibe.android.core.protocol.StableJson
import org.daovibe.android.core.protocol.VoteValue
import org.daovibe.android.core.protocol.estimatePacketSize
import org.daovibe.android.core.protocol.sha256
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.MeaningEntity
import org.daovibe.android.core.storage.PacketEntity
import org.daovibe.android.core.storage.PhraseEntity
import org.daovibe.android.core.storage.VoteEntity
import java.util.Locale

class LocalMyceliumRepository(
    private val database: DaoVibeDatabase,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L },
    private val zone: String = "local_device_zone"
) {
    private val dao = database.daoVibeDao()
    private val validator = PacketValidator()
    private val packetFactory = PacketFactory(nowSeconds)
    val identityRepository = DeviceIdentityRepository(dao, nowSeconds)

    fun observeSnapshot(): Flow<LocalMyceliumSnapshot> {
        return combine(
            identityRepository.observeIdentity(),
            dao.observePhrases(),
            dao.observeMeanings(),
            dao.observeVotes(),
            dao.observeRecentPackets(20)
        ) { identity, phrases, meanings, votes, packets ->
            LocalMyceliumSnapshot(
                identity = identity,
                state = MyceliumReducer.fromStorageRows(phrases, meanings, votes),
                recentPackets = packets
            )
        }
    }

    suspend fun ensureDeviceIdentity() =
        identityRepository.getOrCreate()

    suspend fun observePhrase(surfaceText: String): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val trimmedSurfaceText = surfaceText.trim()
        require(trimmedSurfaceText.isNotEmpty()) { "phrase must be a non-empty string" }

        val payload = PhraseObservedPayload(
            phraseId = phraseIdFor(trimmedSurfaceText),
            surfaceText = trimmedSurfaceText,
            languageHint = "und",
            inputType = InputType.TEXT
        )

        return receivePacket(
            packetFactory.create(
                packetType = PacketType.PHRASE_OBSERVED,
                zone = zone,
                author = identity.nodeId,
                payload = payload
            )
        )
    }

    suspend fun proposeMeaning(
        phraseId: String,
        referenceMeaning: String,
        confidence: Double = 0.25
    ): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val trimmedPhraseId = phraseId.trim()
        val trimmedMeaning = referenceMeaning.trim()
        require(trimmedPhraseId.isNotEmpty()) { "phraseId must be a non-empty string" }
        require(trimmedMeaning.isNotEmpty()) { "referenceMeaning must be a non-empty string" }

        val payload = MeaningProposalPayload(
            phraseId = trimmedPhraseId,
            meaningId = meaningIdFor(trimmedPhraseId, trimmedMeaning),
            referenceMeaning = trimmedMeaning,
            confidence = confidence
        )

        return receivePacket(
            packetFactory.create(
                packetType = PacketType.MEANING_PROPOSAL,
                zone = zone,
                author = identity.nodeId,
                payload = payload
            )
        )
    }

    suspend fun voteMeaning(
        phraseId: String,
        meaningId: String,
        vote: VoteValue,
        confidence: Double = 1.0
    ): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val payload = MeaningVotePayload(
            phraseId = phraseId.trim(),
            meaningId = meaningId.trim(),
            vote = vote,
            confidence = confidence
        )

        return receivePacket(
            packetFactory.create(
                packetType = PacketType.MEANING_VOTE,
                zone = zone,
                author = identity.nodeId,
                payload = payload
            )
        )
    }

    suspend fun applySafetyLabel(
        phraseId: String,
        label: SafetyLabel,
        reason: String? = null
    ): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val payload = SafetyLabelPayload(
            phraseId = phraseId.trim(),
            label = label,
            reason = reason?.trim()?.takeIf { it.isNotEmpty() }
        )

        return receivePacket(
            packetFactory.create(
                packetType = PacketType.SAFETY_LABEL,
                zone = zone,
                author = identity.nodeId,
                payload = payload
            )
        )
    }

    suspend fun receivePacket(
        packet: LmpPacket<PacketPayload>,
        receivedAt: Long = nowSeconds()
    ): PacketReceiveResult {
        val validation = validator.validate(packet)
        if (!validation.valid) {
            return PacketReceiveResult(
                decision = PacketReceiveDecision.REJECTED_INVALID,
                packetId = packet.packetId,
                errors = validation.errors
            )
        }

        if (packet.expiresAt != null && packet.expiresAt < receivedAt) {
            return PacketReceiveResult(
                decision = PacketReceiveDecision.REJECTED_EXPIRED,
                packetId = packet.packetId,
                errors = listOf("Packet expired")
            )
        }

        return try {
            database.withTransaction {
                if (dao.packetCountById(packet.packetId) > 0) {
                    return@withTransaction PacketReceiveResult(
                        decision = PacketReceiveDecision.ALREADY_STORED,
                        packetId = packet.packetId
                    )
                }

                val inserted = dao.insertPacket(packet.toEntity(receivedAt))
                if (inserted == -1L) {
                    return@withTransaction PacketReceiveResult(
                        decision = PacketReceiveDecision.ALREADY_STORED,
                        packetId = packet.packetId
                    )
                }

                applyPacketToDerivedState(packet, receivedAt)
                PacketReceiveResult(
                    decision = PacketReceiveDecision.ACCEPTED_NEW,
                    packetId = packet.packetId
                )
            }
        } catch (error: IllegalArgumentException) {
            PacketReceiveResult(
                decision = PacketReceiveDecision.FAILED_APPLY,
                packetId = packet.packetId,
                errors = listOf(error.message ?: "Failed to apply packet")
            )
        } catch (error: IllegalStateException) {
            PacketReceiveResult(
                decision = PacketReceiveDecision.FAILED_APPLY,
                packetId = packet.packetId,
                errors = listOf(error.message ?: "Failed to apply packet")
            )
        }
    }

    suspend fun rebuildDerivedStateFromLedger(): MyceliumState {
        return database.withTransaction {
            val packets = dao.listPacketsForReplay()
                .map { PacketJsonCodec.decode(it.packetJson) }

            for (packet in packets) {
                val validation = validator.validate(packet)
                require(validation.valid) {
                    "Invalid packet in ledger ${packet.packetId}: ${validation.errors.joinToString(", ")}"
                }
            }

            dao.clearVotes()
            dao.clearMeanings()
            dao.clearPhrases()

            for (packet in packets) {
                applyPacketToDerivedState(packet, updatedAt = packet.createdAt)
            }

            MyceliumReducer.fromStorageRows(
                phrases = dao.listPhrases(),
                meanings = dao.listMeanings(),
                votes = dao.listVotes()
            )
        }
    }

    private suspend fun applyPacketToDerivedState(
        packet: LmpPacket<PacketPayload>,
        updatedAt: Long
    ) {
        when (packet.packetType) {
            PacketType.PHRASE_OBSERVED -> {
                val payload = packet.payload as PhraseObservedPayload
                val phrase = PhraseEntity(
                    phraseId = payload.phraseId,
                    surfaceText = payload.surfaceText,
                    phoneticHint = payload.phoneticHint,
                    languageHint = payload.languageHint,
                    safetyLabel = SafetyLabel.NORMAL.wireValue,
                    updatedAt = updatedAt
                )
                val inserted = dao.insertPhrase(phrase)
                if (inserted == -1L) {
                    dao.mergePhrase(
                        phraseId = payload.phraseId,
                        surfaceText = payload.surfaceText,
                        phoneticHint = payload.phoneticHint,
                        languageHint = payload.languageHint,
                        safetyLabel = SafetyLabel.NORMAL.wireValue,
                        updatedAt = updatedAt
                    )
                }
            }
            PacketType.MEANING_PROPOSAL -> {
                val payload = packet.payload as MeaningProposalPayload
                require(dao.phraseCountById(payload.phraseId) > 0) {
                    "Phrase not found: ${payload.phraseId}"
                }
                dao.insertMeaning(
                    MeaningEntity(
                        meaningId = payload.meaningId,
                        phraseId = payload.phraseId,
                        referenceMeaning = payload.referenceMeaning,
                        context = payload.context,
                        confidence = payload.confidence,
                        confirms = 0.0,
                        rejects = 0.0,
                        updatedAt = updatedAt
                    )
                )
            }
            PacketType.MEANING_VOTE -> {
                val payload = packet.payload as MeaningVotePayload
                require(dao.meaningCountById(payload.meaningId) > 0) {
                    "Meaning not found: ${payload.meaningId}"
                }
                dao.insertVote(
                    VoteEntity(
                        votePacketId = packet.packetId,
                        phraseId = payload.phraseId,
                        meaningId = payload.meaningId,
                        vote = payload.vote.wireValue,
                        confidence = payload.confidence,
                        author = packet.author,
                        createdAt = packet.createdAt
                    )
                )
            }
            PacketType.SAFETY_LABEL -> {
                val payload = packet.payload as SafetyLabelPayload
                require(dao.phraseCountById(payload.phraseId) > 0) {
                    "Phrase not found: ${payload.phraseId}"
                }
                dao.updateSafetyLabel(
                    phraseId = payload.phraseId,
                    label = payload.label.wireValue,
                    updatedAt = updatedAt
                )
            }
        }
    }

    private fun phraseIdFor(surfaceText: String): String =
        "phrase_${sha256(surfaceText.lowercase(Locale.ROOT)).take(16)}"

    private fun meaningIdFor(phraseId: String, referenceMeaning: String): String =
        "meaning_${sha256("${phraseId}:${referenceMeaning.lowercase(Locale.ROOT)}").take(16)}"

    private fun LmpPacket<PacketPayload>.toEntity(receivedAt: Long): PacketEntity {
        val payloadMap = payload.toStableMap()
        val packetSize = estimatePacketSize(this)

        return PacketEntity(
            packetId = packetId,
            packetType = packetType.wireValue,
            zone = zone,
            author = author,
            parent = parent,
            phraseId = payloadMap["phrase_id"] as? String,
            meaningId = payloadMap["meaning_id"] as? String,
            payloadHash = payloadHash,
            payloadJson = StableJson.stringify(payloadMap),
            packetJson = StableJson.stringify(toStableMap()),
            packetSizeBytes = packetSize.bytes,
            packetSizeClass = packetSize.sizeClass.wireValue,
            sizeRecommendation = packetSize.recommendation,
            createdAt = createdAt,
            receivedAt = receivedAt
        )
    }
}
