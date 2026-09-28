package org.daovibe.android.core.mycelium

import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.MeaningProposalPayload
import org.daovibe.android.core.protocol.MeaningVotePayload
import org.daovibe.android.core.protocol.CorrectionProposedPayload
import org.daovibe.android.core.protocol.CorrectionVotePayload
import org.daovibe.android.core.protocol.CorrectionTombstoneProposedPayload
import org.daovibe.android.core.protocol.CorrectionTombstoneVotePayload
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PhraseObservedPayload
import org.daovibe.android.core.protocol.SafetyLabel
import org.daovibe.android.core.protocol.SafetyLabelPayload
import org.daovibe.android.core.storage.MeaningEntity
import org.daovibe.android.core.storage.PhraseEntity
import org.daovibe.android.core.storage.VoteEntity

object MyceliumReducer {
    fun reduce(packets: List<LmpPacket<PacketPayload>>): MyceliumState {
        val phrases = linkedMapOf<String, MutablePhrase>()
        val meaningPhraseById = linkedMapOf<String, String>()
        val votes = mutableListOf<MeaningVoteEvidence>()
        val corrections = linkedMapOf<CorrectionKey, CorrectionProposalEvidence>()
        val correctionVotes = mutableListOf<CorrectionVoteEvidence>()
        val tombstones = linkedMapOf<TombstoneKey, TombstoneProposalEvidence>()
        val tombstoneVotes = mutableListOf<TombstoneVoteEvidence>()

        val meaningProposalIds = packets.mapNotNull { packet ->
            (packet.payload as? MeaningProposalPayload)?.let {
                Triple(it.phraseId, it.meaningId, packet.packetId)
            }
        }.toSet()
        val pending = packets.toMutableList()
        while (pending.isNotEmpty()) {
            val deferred = mutableListOf<LmpPacket<PacketPayload>>()
            var appliedAny = false
            for (packet in pending) {
                val applied = when (packet.packetType) {
                PacketType.PHRASE_OBSERVED -> {
                    val payload = packet.payload as PhraseObservedPayload
                    val existing = phrases[payload.phraseId]
                    if (existing == null) {
                        phrases[payload.phraseId] = MutablePhrase(
                                phraseId = payload.phraseId,
                                surfaceText = payload.surfaceText,
                                phoneticHint = payload.phoneticHint,
                                languageHint = payload.languageHint,
                                safetyLabel = SafetyLabel.NORMAL.wireValue
                            )
                    } else {
                        if (payload.surfaceText != null) existing.surfaceText = payload.surfaceText
                        if (payload.phoneticHint != null) existing.phoneticHint = payload.phoneticHint
                        if (payload.languageHint != null) existing.languageHint = payload.languageHint
                    }
                    true
                }
                PacketType.MEANING_PROPOSAL -> {
                    val payload = packet.payload as MeaningProposalPayload
                    val phrase = phrases[payload.phraseId]
                    if (phrase == null) {
                        false
                    } else if (meaningPhraseById.containsKey(payload.meaningId)) {
                        true
                    } else {
                        phrase.meanings.putIfAbsent(
                            payload.meaningId,
                            MutableMeaning(
                                meaningId = payload.meaningId,
                                referenceMeaning = payload.referenceMeaning,
                                context = payload.context,
                                confidence = payload.confidence
                            )
                        )
                        meaningPhraseById[payload.meaningId] = payload.phraseId
                        true
                    }
                }
                PacketType.MEANING_VOTE -> {
                    val payload = packet.payload as MeaningVotePayload
                    if (meaningPhraseById[payload.meaningId] == null) {
                        false
                    } else {
                        votes += MeaningVoteEvidence(
                            votePacketId = packet.packetId,
                            phraseId = payload.phraseId,
                            meaningId = payload.meaningId,
                            vote = payload.vote.wireValue,
                            author = packet.author,
                            createdAt = packet.createdAt
                        )
                        true
                    }
                }
                PacketType.CORRECTION_PROPOSED -> {
                    val payload = packet.payload as CorrectionProposedPayload
                    val phrase = phrases[payload.phraseId]
                    if (phrase == null || meaningPhraseById[payload.meaningId] != payload.phraseId ||
                        Triple(payload.phraseId, payload.meaningId, packet.parent) !in meaningProposalIds
                    ) {
                        false
                    } else {
                        corrections.putIfAbsent(
                            CorrectionKey(payload.phraseId, payload.meaningId, payload.correctionId),
                            CorrectionProposalEvidence(
                                packet.packetId, payload.phraseId, payload.meaningId, payload.correctionId,
                                payload.referenceMeaning, payload.context, payload.confidence
                            )
                        )
                        true
                    }
                }
                PacketType.CORRECTION_VOTE -> {
                    val payload = packet.payload as CorrectionVotePayload
                    val key = CorrectionKey(payload.phraseId, payload.meaningId, payload.correctionId)
                    val proposal = corrections[key]
                    if (proposal == null || proposal.packetId != packet.parent) {
                        false
                    } else {
                        correctionVotes += CorrectionVoteEvidence(
                            packet.packetId, payload.phraseId, payload.meaningId,
                            payload.correctionId, payload.vote.wireValue, packet.author,
                            packet.createdAt
                        )
                        true
                    }
                }
                PacketType.CORRECTION_TOMBSTONE_PROPOSED -> {
                    val payload = packet.payload as CorrectionTombstoneProposedPayload
                    val correctionKey = CorrectionKey(payload.phraseId, payload.meaningId, payload.correctionId)
                    val correction = corrections[correctionKey]
                    if (correction == null || correction.packetId != packet.parent) {
                        false
                    } else {
                        tombstones.putIfAbsent(
                            TombstoneKey(payload.phraseId, payload.meaningId, payload.correctionId, payload.tombstoneId),
                            TombstoneProposalEvidence(
                                packet.packetId, payload.tombstoneId, payload.phraseId,
                                payload.meaningId, payload.correctionId, payload.reason, payload.confidence
                            )
                        )
                        true
                    }
                }
                PacketType.CORRECTION_TOMBSTONE_VOTE -> {
                    val payload = packet.payload as CorrectionTombstoneVotePayload
                    val key = TombstoneKey(payload.phraseId, payload.meaningId, payload.correctionId, payload.tombstoneId)
                    val proposal = tombstones[key]
                    if (proposal == null || proposal.packetId != packet.parent) {
                        false
                    } else {
                        tombstoneVotes += TombstoneVoteEvidence(
                            packet.packetId, payload.tombstoneId, payload.phraseId,
                            payload.meaningId, payload.correctionId, payload.vote.wireValue,
                            packet.author, packet.createdAt
                        )
                        true
                    }
                }
                PacketType.SAFETY_LABEL -> {
                    val payload = packet.payload as SafetyLabelPayload
                    val phrase = phrases[payload.phraseId]
                    if (phrase == null) false else {
                        phrase.safetyLabel = payload.label.wireValue
                        true
                    }
                }
            }
                if (applied) appliedAny = true else deferred += packet
            }
            if (!appliedAny) break
            pending.clear()
            pending += deferred
        }

        return deriveState(
            phrases = phrases.values.toList(),
            votes = votes,
            corrections = corrections.values.toList(), correctionVotes = correctionVotes,
            tombstones = tombstones.values.toList(), tombstoneVotes = tombstoneVotes
        )
    }

    fun fromStorageRows(
        phrases: List<PhraseEntity>,
        meanings: List<MeaningEntity>,
        votes: List<VoteEntity>
    ): MyceliumState {
        val mutablePhrases = phrases.associate { phrase ->
            phrase.phraseId to MutablePhrase(
                phraseId = phrase.phraseId,
                surfaceText = phrase.surfaceText,
                phoneticHint = phrase.phoneticHint,
                languageHint = phrase.languageHint,
                safetyLabel = phrase.safetyLabel
            )
        }.toMutableMap()

        for (meaning in meanings) {
            mutablePhrases[meaning.phraseId]?.meanings?.putIfAbsent(
                meaning.meaningId,
                MutableMeaning(
                    meaningId = meaning.meaningId,
                    referenceMeaning = meaning.referenceMeaning,
                    context = meaning.context,
                    confidence = meaning.confidence
                )
            )
        }

        return deriveState(
            phrases = mutablePhrases.values.toList(),
            votes = votes.map {
                MeaningVoteEvidence(
                    votePacketId = it.votePacketId,
                    phraseId = it.phraseId,
                    meaningId = it.meaningId,
                    vote = it.vote,
                    author = it.author,
                    createdAt = it.createdAt
                )
            }, corrections = emptyList(), correctionVotes = emptyList(),
            tombstones = emptyList(), tombstoneVotes = emptyList()
        )
    }

    private fun deriveState(
        phrases: List<MutablePhrase>,
        votes: List<MeaningVoteEvidence>,
        corrections: List<CorrectionProposalEvidence> = emptyList(),
        correctionVotes: List<CorrectionVoteEvidence> = emptyList(),
        tombstones: List<TombstoneProposalEvidence> = emptyList(),
        tombstoneVotes: List<TombstoneVoteEvidence> = emptyList()
    ): MyceliumState {
        val countsByMeaning = countUniqueVoterVotes(
            votes
                .filter { it.vote == "confirm" || it.vote == "reject" }
                .map {
                    UniqueVoterVoteInput(
                        targetKey = it.meaningId,
                        voterId = it.author,
                        vote = it.vote,
                        createdAt = it.createdAt,
                        packetId = it.votePacketId
                    )
                }
        )

        val correctionCounts = countUniqueVoterVotes(correctionVotes.filter { it.vote == "confirm" || it.vote == "reject" }.map { UniqueVoterVoteInput("${it.phraseId}\u0000${it.meaningId}\u0000${it.correctionId}", it.author, it.vote, it.createdAt, it.votePacketId) })
        val tombstoneCounts = countUniqueVoterVotes(tombstoneVotes.filter { it.vote == "confirm" || it.vote == "reject" }.map {
            UniqueVoterVoteInput("${it.phraseId}\u0000${it.meaningId}\u0000${it.correctionId}\u0000${it.tombstoneId}", it.author, it.vote, it.createdAt, it.votePacketId)
        })
        val tombstoneStates = tombstones.groupBy { Triple(it.phraseId, it.meaningId, it.correctionId) }.mapValues { (_, proposals) ->
            val scored = proposals.map { proposal ->
                val key = "${proposal.phraseId}\u0000${proposal.meaningId}\u0000${proposal.correctionId}\u0000${proposal.tombstoneId}"
                val counts = tombstoneCounts[key]
                val score = calculateMeaningScore(proposal.confidence, counts?.confirmVotes ?: 0.0, counts?.rejectVotes ?: 0.0)
                CorrectionTombstoneState(proposal.tombstoneId, proposal.correctionId, proposal.reason, score.confidence, score.confirms, score.rejects, score.totalVotes, score.score, false)
            }.sortedBy { it.tombstoneId }
            val winner = scored.filter { it.confirms > it.rejects && it.confirms >= 1.0 }
                .sortedWith(compareByDescending<CorrectionTombstoneState> { it.score }.thenBy { it.tombstoneId })
                .firstOrNull()?.tombstoneId
            scored.map { it.copy(effective = it.tombstoneId == winner) }
        }
        val correctionStates = corrections.groupBy { it.phraseId to it.meaningId }.mapValues { (_, proposals) -> proposals.map { proposal ->
            val correctionKey = "${proposal.phraseId}\u0000${proposal.meaningId}\u0000${proposal.correctionId}"
            val counts = correctionCounts[correctionKey]
            val score = calculateMeaningScore(proposal.confidence, counts?.confirmVotes ?: 0.0, counts?.rejectVotes ?: 0.0)
            val candidateTombstones = tombstoneStates[Triple(proposal.phraseId, proposal.meaningId, proposal.correctionId)].orEmpty()
            val effectiveTombstone = candidateTombstones.firstOrNull { it.effective }
            CorrectionState(
                proposal.correctionId, proposal.referenceMeaning, proposal.context,
                score.confidence, score.confirms, score.rejects, score.totalVotes, score.score,
                tombstoned = effectiveTombstone != null,
                effectiveTombstoneId = effectiveTombstone?.tombstoneId,
                tombstones = candidateTombstones
            )
        }.sortedBy { it.correctionId } }
        return MyceliumState(
            phrases = phrases.map { phrase ->
                PhraseState(
                    phraseId = phrase.phraseId,
                    surfaceText = phrase.surfaceText,
                    phoneticHint = phrase.phoneticHint,
                    languageHint = phrase.languageHint,
                    safetyLabel = phrase.safetyLabel,
                    meanings = phrase.meanings.values.map { meaning ->
                        val counts = countsByMeaning[meaning.meaningId]
                        val score = calculateMeaningScore(
                            confidence = meaning.confidence,
                            confirms = counts?.confirmVotes ?: 0.0,
                            rejects = counts?.rejectVotes ?: 0.0
                        )
                        val candidates = correctionStates[phrase.phraseId to meaning.meaningId].orEmpty()
                        val effective = candidates.filter { !it.tombstoned && it.confirms > it.rejects && it.confirms >= 1.0 }
                            .sortedWith(compareByDescending<CorrectionState> { it.score }.thenBy { it.correctionId }).firstOrNull()
                        MeaningState(
                            meaningId = meaning.meaningId,
                            referenceMeaning = meaning.referenceMeaning,
                            context = meaning.context,
                            confidence = score.confidence,
                            confirms = score.confirms,
                            rejects = score.rejects,
                            score = score.score,
                            totalVotes = score.totalVotes, corrections = candidates,
                            effectiveCorrectionId = effective?.correctionId,
                            effectiveReferenceMeaning = effective?.referenceMeaning ?: meaning.referenceMeaning,
                            effectiveContext = if (effective != null) effective.context else meaning.context
                        )
                    }
                )
            }
        )
    }

    private data class MutablePhrase(
        val phraseId: String,
        var surfaceText: String?,
        var phoneticHint: String?,
        var languageHint: String?,
        var safetyLabel: String,
        val meanings: LinkedHashMap<String, MutableMeaning> = linkedMapOf()
    )

    private data class MutableMeaning(
        val meaningId: String,
        val referenceMeaning: String,
        val context: String?,
        val confidence: Double
    )

    private data class MeaningVoteEvidence(
        val votePacketId: String,
        val phraseId: String,
        val meaningId: String,
        val vote: String,
        val author: String,
        val createdAt: Long
    )
    private data class CorrectionKey(val phraseId: String, val meaningId: String, val correctionId: String)
    private data class CorrectionProposalEvidence(val packetId: String, val phraseId: String, val meaningId: String, val correctionId: String, val referenceMeaning: String, val context: String?, val confidence: Double)
    private data class CorrectionVoteEvidence(val votePacketId: String, val phraseId: String, val meaningId: String, val correctionId: String, val vote: String, val author: String, val createdAt: Long)
    private data class TombstoneKey(val phraseId: String, val meaningId: String, val correctionId: String, val tombstoneId: String)
    private data class TombstoneProposalEvidence(val packetId: String, val tombstoneId: String, val phraseId: String, val meaningId: String, val correctionId: String, val reason: String, val confidence: Double)
    private data class TombstoneVoteEvidence(val votePacketId: String, val tombstoneId: String, val phraseId: String, val meaningId: String, val correctionId: String, val vote: String, val author: String, val createdAt: Long)
}
