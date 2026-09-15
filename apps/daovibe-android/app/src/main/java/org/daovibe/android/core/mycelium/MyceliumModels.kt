package org.daovibe.android.core.mycelium

import org.daovibe.android.core.identity.DeviceIdentity
import org.daovibe.android.core.storage.PacketEntity

data class MeaningState(
    val meaningId: String,
    val referenceMeaning: String,
    val context: String?,
    val confidence: Double,
    val confirms: Double,
    val rejects: Double,
    val score: Double,
    val totalVotes: Double
)

data class PhraseState(
    val phraseId: String,
    val surfaceText: String?,
    val phoneticHint: String?,
    val languageHint: String?,
    val safetyLabel: String,
    val meanings: List<MeaningState>
)

data class BestMeaning(
    val phraseId: String,
    val meaningId: String,
    val referenceMeaning: String,
    val confidence: Double,
    val confirms: Double,
    val rejects: Double,
    val score: Double,
    val totalVotes: Double
)

data class MyceliumState(
    val phrases: List<PhraseState>
) {
    fun findPhrase(phraseId: String): PhraseState? =
        phrases.firstOrNull { it.phraseId == phraseId }

    fun bestMeaning(phraseId: String): BestMeaning? {
        val phrase = findPhrase(phraseId) ?: return null
        val meaning = phrase.meanings.maxWithOrNull(compareBy<MeaningState> { it.score })
            ?: return null

        return BestMeaning(
            phraseId = phrase.phraseId,
            meaningId = meaning.meaningId,
            referenceMeaning = meaning.referenceMeaning,
            confidence = meaning.confidence,
            confirms = meaning.confirms,
            rejects = meaning.rejects,
            score = meaning.score,
            totalVotes = meaning.totalVotes
        )
    }
}

data class LocalMyceliumSnapshot(
    val identity: DeviceIdentity?,
    val state: MyceliumState,
    val recentPackets: List<PacketEntity>,
    val ledgerPackets: List<PacketEntity> = recentPackets
)

enum class PacketReceiveDecision {
    ACCEPTED_NEW,
    ALREADY_STORED,
    REJECTED_INVALID,
    REJECTED_EXPIRED,
    FAILED_APPLY
}

data class PacketReceiveResult(
    val decision: PacketReceiveDecision,
    val packetId: String?,
    val errors: List<String> = emptyList()
)
