package org.daovibe.android.core.protocol

enum class PacketSignatureStatus {
    MISSING,
    DEV_SIGNATURE_VALID,
    DEV_SIGNATURE_MISMATCH,
    LEGACY_PLACEHOLDER,
    PRESENT_UNVERIFIED
}

data class PacketValidationResult(
    val valid: Boolean,
    val errors: List<String>,
    val signatureStatus: PacketSignatureStatus,
    val signatureInputHash: String
)

class PacketValidator {
    fun validate(packet: LmpPacket<PacketPayload>): PacketValidationResult {
        val errors = mutableListOf<String>()
        var signatureStatus = PacketSignatureStatus.MISSING

        if (packet.version != LMP_VERSION) {
            errors += "Unsupported version: ${packet.version}"
        }

        if (packet.packetType !in supportedPacketTypes) {
            errors += "Unsupported packet type: ${packet.packetType.wireValue}"
        }

        validateMilestonePayload(packet, errors)

        if (packet.packetId.isBlank()) errors += "Missing packet_id"
        if (packet.zone.isBlank()) errors += "Missing zone"
        if (packet.author.isBlank()) errors += "Missing author"
        if (packet.createdAt <= 0L) errors += "Invalid created_at"
        if (packet.expiresAt != null && packet.expiresAt <= 0L) errors += "Invalid expires_at"
        if (packet.signature.isBlank()) errors += "Missing signature"

        val expectedPayloadHash = sha256(StableJson.stringify(packet.payload.toStableMap()))
        if (packet.payloadHash != expectedPayloadHash) {
            errors += "Invalid payload_hash"
        }

        val expectedPacketId = sha256(StableJson.stringify(packet.hashInputMap()))
        if (packet.packetId != expectedPacketId) {
            errors += "Invalid packet_id"
        }

        val signatureInputHash = sha256(StableJson.stringify(packet.signatureInputMap()))
        if (packet.signature == LEGACY_DEV_SIGNATURE_PLACEHOLDER) {
            signatureStatus = PacketSignatureStatus.LEGACY_PLACEHOLDER
        } else if (packet.signature.isNotBlank()) {
            val expectedDevSignature = createDevSignature(packet.author, packet.packetId)

            signatureStatus = when {
                packet.signature == expectedDevSignature -> PacketSignatureStatus.DEV_SIGNATURE_VALID
                packet.signature.startsWith("$DEV_SIGNATURE_PREFIX:") -> {
                    errors += "Invalid dev signature"
                    PacketSignatureStatus.DEV_SIGNATURE_MISMATCH
                }
                else -> PacketSignatureStatus.PRESENT_UNVERIFIED
            }
        }

        return PacketValidationResult(
            valid = errors.isEmpty(),
            errors = errors,
            signatureStatus = signatureStatus,
            signatureInputHash = signatureInputHash
        )
    }

    private fun validateMilestonePayload(
        packet: LmpPacket<PacketPayload>,
        errors: MutableList<String>
    ) {
        if (packet.packetType != packet.payload.packetType) {
            errors += "Packet type does not match payload type"
        }

        when (val payload = packet.payload) {
            is PhraseObservedPayload -> {
                requireNonEmpty(payload.phraseId, "phrase_id", errors)
            }
            is MeaningProposalPayload -> {
                requireNonEmpty(payload.phraseId, "phrase_id", errors)
                requireNonEmpty(payload.meaningId, "meaning_id", errors)
                requireNonEmpty(payload.referenceMeaning, "reference_meaning", errors)
                if (!payload.confidence.isFinite()) errors += "Invalid payload.confidence"
            }
            is MeaningVotePayload -> {
                requireNonEmpty(payload.phraseId, "phrase_id", errors)
                requireNonEmpty(payload.meaningId, "meaning_id", errors)
                if (!payload.confidence.isFinite()) errors += "Invalid payload.confidence"
            }
            is SafetyLabelPayload -> {
                requireNonEmpty(payload.phraseId, "phrase_id", errors)
            }
        }
    }

    private fun requireNonEmpty(
        value: String,
        fieldName: String,
        errors: MutableList<String>
    ) {
        if (value.trim().isEmpty()) {
            errors += "Missing payload.$fieldName"
        }
    }

    companion object {
        private val supportedPacketTypes = setOf(
            PacketType.PHRASE_OBSERVED,
            PacketType.MEANING_PROPOSAL,
            PacketType.MEANING_VOTE,
            PacketType.SAFETY_LABEL
        )
    }
}
