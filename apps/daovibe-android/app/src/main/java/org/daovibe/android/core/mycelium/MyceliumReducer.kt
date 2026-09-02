package org.daovibe.android.core.mycelium

import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.MeaningProposalPayload
import org.daovibe.android.core.protocol.MeaningVotePayload
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
        val votes = mutableListOf<MeaningVoteEvidence>()

        for (packet in packets) {
            when (packet.packetType) {
                PacketType.PHRASE_OBSERVED -> {
                    val payload = packet.payload as PhraseObservedPayload
                    phrases.putIfAbsent(
                        payload.phraseId,
                        MutablePhrase(
                            phraseId = payload.phraseId,
                            surfaceText = payload.surfaceText,
                            phoneticHint = payload.phoneticHint,
                            languageHint = payload.languageHint,
                            safetyLabel = SafetyLabel.NORMAL.wireValue
                        )
                    )
                }
                PacketType.MEANING_PROPOSAL -> {
                    val payload = packet.payload as MeaningProposalPayload
                    val phrase = phrases[payload.phraseId] ?: continue
                    phrase.meanings.putIfAbsent(
                        payload.meaningId,
                        MutableMeaning(
                            meaningId = payload.meaningId,
                            referenceMeaning = payload.referenceMeaning,
                            context = payload.context,
                            confidence = payload.confidence
                        )
                    )
                }
                PacketType.MEANING_VOTE -> {
                    val payload = packet.payload as MeaningVotePayload
                    val phrase = phrases[payload.phraseId] ?: continue
                    if (!phrase.meanings.containsKey(payload.meaningId)) continue
                    votes += MeaningVoteEvidence(
                        votePacketId = packet.packetId,
                        phraseId = payload.phraseId,
                        meaningId = payload.meaningId,
                        vote = payload.vote.wireValue,
                        author = packet.author,
                        createdAt = packet.createdAt
                    )
                }
                PacketType.SAFETY_LABEL -> {
                    val payload = packet.payload as SafetyLabelPayload
                    val phrase = phrases[payload.phraseId] ?: continue
                    phrase.safetyLabel = payload.label.wireValue
                }
            }
        }

        return deriveState(
            phrases = phrases.values.toList(),
            votes = votes
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
            }
        )
    }

    private fun deriveState(
        phrases: List<MutablePhrase>,
        votes: List<MeaningVoteEvidence>
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
                        MeaningState(
                            meaningId = meaning.meaningId,
                            referenceMeaning = meaning.referenceMeaning,
                            context = meaning.context,
                            confidence = score.confidence,
                            confirms = score.confirms,
                            rejects = score.rejects,
                            score = score.score,
                            totalVotes = score.totalVotes
                        )
                    }
                )
            }
        )
    }

    private data class MutablePhrase(
        val phraseId: String,
        val surfaceText: String?,
        val phoneticHint: String?,
        val languageHint: String?,
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
}
