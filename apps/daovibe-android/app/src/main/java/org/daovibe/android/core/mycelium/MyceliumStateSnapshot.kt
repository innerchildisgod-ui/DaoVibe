package org.daovibe.android.core.mycelium

import org.daovibe.android.core.protocol.StableJson
import org.daovibe.android.core.protocol.sha256

/**
 * Canonical persisted-node convergence snapshot. For physical/node parity,
 * build this from LocalMyceliumRepository.rebuildDerivedStateFromLedger();
 * the standalone MyceliumReducer.reduce input-order helper is not the ledger
 * replay contract.
 */
data class MyceliumStateSnapshot(
    val phrases: List<PhraseSnapshot>
) {
    /** SHA-256 of the existing compact canonical JSON, UTF-8, without a newline. */
    fun fingerprint(): String = sha256(toCanonicalJson())

    fun toCanonicalJson(): String =
        StableJson.stringify(
            mapOf(
                "phrases" to phrases.map { it.toStableMap() }
            )
        )

    companion object {
        fun fromState(state: MyceliumState): MyceliumStateSnapshot =
            MyceliumStateSnapshot(
                phrases = state.phrases
                    .map { phrase ->
                        val meanings = phrase.meanings
                            .map { meaning ->
                                MeaningSnapshot(
                                    meaningId = meaning.meaningId,
                                    referenceMeaning = meaning.referenceMeaning,
                                    context = meaning.context,
                                    confidence = meaning.confidence,
                                    confirms = meaning.confirms,
                                    rejects = meaning.rejects,
                                    score = meaning.score,
                                    totalVotes = meaning.totalVotes,
                                    corrections = meaning.corrections.map { correction ->
                                        CorrectionSnapshot(
                                            correction.correctionId, correction.referenceMeaning, correction.context,
                                            correction.confidence, correction.confirms, correction.rejects,
                                            correction.totalVotes, correction.score, correction.tombstoned,
                                            correction.effectiveTombstoneId,
                                            correction.tombstones.map {
                                                CorrectionTombstoneSnapshot(
                                                    it.tombstoneId, it.reason, it.confidence, it.confirms,
                                                    it.rejects, it.totalVotes, it.score, it.effective
                                                )
                                            }
                                        )
                                    },
                                    effectiveCorrectionId = meaning.effectiveCorrectionId,
                                    effectiveReferenceMeaning = meaning.effectiveReferenceMeaning,
                                    effectiveContext = meaning.effectiveContext
                                )
                            }
                            .sortedBy { it.meaningId }
                        val best = state.bestMeaning(phrase.phraseId)
                        PhraseSnapshot(
                            phraseId = phrase.phraseId,
                            surfaceText = phrase.surfaceText,
                            phoneticHint = phrase.phoneticHint,
                            languageHint = phrase.languageHint,
                            safetyLabel = phrase.safetyLabel,
                            bestMeaningId = best?.meaningId,
                            meanings = meanings
                        )
                    }
                    .sortedBy { it.phraseId }
            )
    }
}

data class PhraseSnapshot(
    val phraseId: String,
    val surfaceText: String?,
    val phoneticHint: String?,
    val languageHint: String?,
    val safetyLabel: String,
    val bestMeaningId: String?,
    val meanings: List<MeaningSnapshot>
) {
    fun toStableMap(): Map<String, Any?> =
        linkedMapOf(
            "phrase_id" to phraseId,
            "surface_text" to surfaceText,
            "phonetic_hint" to phoneticHint,
            "language_hint" to languageHint,
            "safety_label" to safetyLabel,
            "best_meaning_id" to bestMeaningId,
            "meanings" to meanings.map { it.toStableMap() }
        )
}

data class MeaningSnapshot(
    val meaningId: String,
    val referenceMeaning: String,
    val context: String?,
    val confidence: Double,
    val confirms: Double,
    val rejects: Double,
    val score: Double,
    val totalVotes: Double,
    val corrections: List<CorrectionSnapshot> = emptyList(),
    val effectiveCorrectionId: String? = null,
    val effectiveReferenceMeaning: String = referenceMeaning,
    val effectiveContext: String? = context
) {
    fun toStableMap(): Map<String, Any?> {
        val map = linkedMapOf<String, Any?>(
            "meaning_id" to meaningId,
            "reference_meaning" to referenceMeaning,
            "context" to context,
            "confidence" to confidence,
            "confirms" to confirms,
            "rejects" to rejects,
            "score" to score,
            "total_votes" to totalVotes
        )
        if (corrections.isNotEmpty()) {
            map["corrections"] = corrections.map { it.toStableMap() }
            map["effective_correction_id"] = effectiveCorrectionId
            map["effective_reference_meaning"] = effectiveReferenceMeaning
            map["effective_context"] = effectiveContext
        }
        return map
    }
}

data class CorrectionSnapshot(
    val correctionId: String,
    val referenceMeaning: String,
    val context: String?,
    val confidence: Double,
    val confirms: Double,
    val rejects: Double,
    val totalVotes: Double,
    val score: Double,
    val tombstoned: Boolean = false,
    val effectiveTombstoneId: String? = null,
    val tombstones: List<CorrectionTombstoneSnapshot> = emptyList()
) {
    fun toStableMap(): Map<String, Any?> {
        val map = linkedMapOf<String, Any?>("correction_id" to correctionId, "reference_meaning" to referenceMeaning, "context" to context, "confidence" to confidence, "confirms" to confirms, "rejects" to rejects, "total_votes" to totalVotes, "score" to score)
        if (tombstones.isNotEmpty()) {
            map["tombstoned"] = tombstoned
            map["effective_tombstone_id"] = effectiveTombstoneId
            map["tombstones"] = tombstones.map { it.toStableMap() }
        }
        return map
    }
}

data class CorrectionTombstoneSnapshot(
    val tombstoneId: String,
    val reason: String,
    val confidence: Double,
    val confirms: Double,
    val rejects: Double,
    val totalVotes: Double,
    val score: Double,
    val effective: Boolean
) {
    fun toStableMap(): Map<String, Any?> = linkedMapOf(
        "tombstone_id" to tombstoneId,
        "reason" to reason,
        "confidence" to confidence,
        "confirms" to confirms,
        "rejects" to rejects,
        "total_votes" to totalVotes,
        "score" to score,
        "effective" to effective
    )
}
