package org.daovibe.android.core.protocol

interface PacketPayload {
    val packetType: PacketType
    fun toStableMap(): Map<String, Any?>
}

data class PhraseObservedPayload(
    val phraseId: String,
    val surfaceText: String? = null,
    val phoneticHint: String? = null,
    val languageHint: String? = null,
    val inputType: InputType
) : PacketPayload {
    override val packetType = PacketType.PHRASE_OBSERVED

    override fun toStableMap(): Map<String, Any?> = stablePayloadMap(
        "phrase_id" to phraseId,
        "surface_text" to surfaceText,
        "phonetic_hint" to phoneticHint,
        "language_hint" to languageHint,
        "input_type" to inputType.wireValue
    )
}

data class MeaningProposalPayload(
    val phraseId: String,
    val meaningId: String,
    val referenceMeaning: String,
    val context: String? = null,
    val confidence: Double
) : PacketPayload {
    override val packetType = PacketType.MEANING_PROPOSAL

    override fun toStableMap(): Map<String, Any?> = stablePayloadMap(
        "phrase_id" to phraseId,
        "meaning_id" to meaningId,
        "reference_meaning" to referenceMeaning,
        "context" to context,
        "confidence" to confidence
    )
}

data class MeaningVotePayload(
    val phraseId: String,
    val meaningId: String,
    val vote: VoteValue,
    val confidence: Double
) : PacketPayload {
    override val packetType = PacketType.MEANING_VOTE

    override fun toStableMap(): Map<String, Any?> = stablePayloadMap(
        "phrase_id" to phraseId,
        "meaning_id" to meaningId,
        "vote" to vote.wireValue,
        "confidence" to confidence
    )
}

data class CorrectionProposedPayload(
    val correctionId: String,
    val phraseId: String,
    val meaningId: String,
    val referenceMeaning: String,
    val context: String? = null,
    val confidence: Double
) : PacketPayload {
    override val packetType = PacketType.CORRECTION_PROPOSED
    override fun toStableMap(): Map<String, Any?> = stablePayloadMap(
        "correction_id" to correctionId, "phrase_id" to phraseId, "meaning_id" to meaningId,
        "reference_meaning" to referenceMeaning, "context" to context, "confidence" to confidence
    )
}

data class CorrectionVotePayload(
    val correctionId: String,
    val phraseId: String,
    val meaningId: String,
    val vote: VoteValue,
    val confidence: Double
) : PacketPayload {
    override val packetType = PacketType.CORRECTION_VOTE
    override fun toStableMap(): Map<String, Any?> = stablePayloadMap(
        "correction_id" to correctionId, "phrase_id" to phraseId, "meaning_id" to meaningId,
        "vote" to vote.wireValue, "confidence" to confidence
    )
}

data class CorrectionTombstoneProposedPayload(
    val tombstoneId: String,
    val phraseId: String,
    val meaningId: String,
    val correctionId: String,
    val reason: String,
    val confidence: Double
) : PacketPayload {
    override val packetType = PacketType.CORRECTION_TOMBSTONE_PROPOSED
    override fun toStableMap(): Map<String, Any?> = stablePayloadMap(
        "tombstone_id" to tombstoneId,
        "phrase_id" to phraseId,
        "meaning_id" to meaningId,
        "correction_id" to correctionId,
        "reason" to reason,
        "confidence" to confidence
    )
}

data class CorrectionTombstoneVotePayload(
    val tombstoneId: String,
    val phraseId: String,
    val meaningId: String,
    val correctionId: String,
    val vote: VoteValue,
    val confidence: Double
) : PacketPayload {
    override val packetType = PacketType.CORRECTION_TOMBSTONE_VOTE
    override fun toStableMap(): Map<String, Any?> = stablePayloadMap(
        "tombstone_id" to tombstoneId,
        "phrase_id" to phraseId,
        "meaning_id" to meaningId,
        "correction_id" to correctionId,
        "vote" to vote.wireValue,
        "confidence" to confidence
    )
}

data class SafetyLabelPayload(
    val phraseId: String,
    val label: SafetyLabel,
    val reason: String? = null
) : PacketPayload {
    override val packetType = PacketType.SAFETY_LABEL

    override fun toStableMap(): Map<String, Any?> = stablePayloadMap(
        "phrase_id" to phraseId,
        "label" to label.wireValue,
        "reason" to reason
    )
}

private fun stablePayloadMap(vararg values: Pair<String, Any?>): Map<String, Any?> {
    val map = linkedMapOf<String, Any?>()

    for ((key, value) in values) {
        if (value != null) {
            map[key] = value
        }
    }

    return map
}
