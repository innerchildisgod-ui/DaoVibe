package org.daovibe.android.core.protocol

enum class PacketType(val wireValue: String) {
    PHRASE_OBSERVED("phrase_observed"),
    MEANING_PROPOSAL("meaning_proposal"),
    MEANING_VOTE("meaning_vote"),
    SAFETY_LABEL("safety_label");

    companion object {
        fun fromWireValue(value: String): PacketType? =
            entries.firstOrNull { it.wireValue == value }
    }
}

enum class InputType(val wireValue: String) {
    SPEECH("speech"),
    TEXT("text"),
    SYMBOL("symbol"),
    DRAWING("drawing");

    companion object {
        fun fromWireValue(value: String): InputType? =
            entries.firstOrNull { it.wireValue == value }
    }
}

enum class VoteValue(val wireValue: String) {
    CONFIRM("confirm"),
    REJECT("reject"),
    UNSURE("unsure");

    companion object {
        fun fromWireValue(value: String): VoteValue? =
            entries.firstOrNull { it.wireValue == value }
    }
}

enum class SafetyLabel(val wireValue: String) {
    NORMAL("normal"),
    MILD_SLANG("mild_slang"),
    VULGAR("vulgar"),
    ADULT_18_PLUS("adult_18_plus"),
    ABUSIVE("abusive"),
    DANGEROUS("dangerous"),
    BLOCKED("blocked");

    companion object {
        fun fromWireValue(value: String): SafetyLabel? =
            entries.firstOrNull { it.wireValue == value }
    }
}
