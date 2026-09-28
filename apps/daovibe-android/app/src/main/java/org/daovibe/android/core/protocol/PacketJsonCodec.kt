package org.daovibe.android.core.protocol

import org.json.JSONObject

object PacketJsonCodec {
    fun decode(json: String): LmpPacket<PacketPayload> =
        decode(JSONObject(json))

    fun decode(json: JSONObject): LmpPacket<PacketPayload> {
        val packetType = PacketType.fromWireValue(json.getString("packet_type"))
            ?: error("Unsupported packet type: ${json.getString("packet_type")}")
        val payload = decodePayload(packetType, json.getJSONObject("payload"))

        return LmpPacket(
            version = json.getString("version"),
            packetId = json.getString("packet_id"),
            packetType = packetType,
            createdAt = json.getLong("created_at"),
            expiresAt = optionalLong(json, "expires_at"),
            zone = json.getString("zone"),
            author = json.getString("author"),
            parent = optionalString(json, "parent"),
            payloadHash = json.getString("payload_hash"),
            payload = payload,
            signature = json.getString("signature")
        )
    }

    fun encode(packet: LmpPacket<PacketPayload>): String =
        StableJson.stringify(packet.toStableMap())

    private fun decodePayload(
        packetType: PacketType,
        payload: JSONObject
    ): PacketPayload {
        return when (packetType) {
            PacketType.PHRASE_OBSERVED -> PhraseObservedPayload(
                phraseId = payload.getString("phrase_id"),
                surfaceText = optionalString(payload, "surface_text"),
                phoneticHint = optionalString(payload, "phonetic_hint"),
                languageHint = optionalString(payload, "language_hint"),
                inputType = InputType.fromWireValue(payload.getString("input_type"))
                    ?: error("Invalid payload.input_type")
            )
            PacketType.MEANING_PROPOSAL -> MeaningProposalPayload(
                phraseId = payload.getString("phrase_id"),
                meaningId = payload.getString("meaning_id"),
                referenceMeaning = payload.getString("reference_meaning"),
                context = optionalString(payload, "context"),
                confidence = payload.getDouble("confidence")
            )
            PacketType.MEANING_VOTE -> MeaningVotePayload(
                phraseId = payload.getString("phrase_id"),
                meaningId = payload.getString("meaning_id"),
                vote = VoteValue.fromWireValue(payload.getString("vote"))
                    ?: error("Invalid payload.vote"),
                confidence = payload.getDouble("confidence")
            )
            PacketType.CORRECTION_PROPOSED -> CorrectionProposedPayload(
                correctionId = payload.getString("correction_id"), phraseId = payload.getString("phrase_id"),
                meaningId = payload.getString("meaning_id"), referenceMeaning = payload.getString("reference_meaning"),
                context = optionalString(payload, "context"), confidence = payload.getDouble("confidence")
            )
            PacketType.CORRECTION_VOTE -> CorrectionVotePayload(
                correctionId = payload.getString("correction_id"), phraseId = payload.getString("phrase_id"),
                meaningId = payload.getString("meaning_id"),
                vote = VoteValue.fromWireValue(payload.getString("vote")) ?: error("Invalid payload.vote"),
                confidence = payload.getDouble("confidence")
            )
            PacketType.CORRECTION_TOMBSTONE_PROPOSED -> CorrectionTombstoneProposedPayload(
                tombstoneId = payload.getString("tombstone_id"),
                phraseId = payload.getString("phrase_id"),
                meaningId = payload.getString("meaning_id"),
                correctionId = payload.getString("correction_id"),
                reason = payload.getString("reason"),
                confidence = payload.getDouble("confidence")
            )
            PacketType.CORRECTION_TOMBSTONE_VOTE -> CorrectionTombstoneVotePayload(
                tombstoneId = payload.getString("tombstone_id"),
                phraseId = payload.getString("phrase_id"),
                meaningId = payload.getString("meaning_id"),
                correctionId = payload.getString("correction_id"),
                vote = VoteValue.fromWireValue(payload.getString("vote"))
                    ?: error("Invalid payload.vote"),
                confidence = payload.getDouble("confidence")
            )
            PacketType.SAFETY_LABEL -> SafetyLabelPayload(
                phraseId = payload.getString("phrase_id"),
                label = SafetyLabel.fromWireValue(payload.getString("label"))
                    ?: error("Invalid payload.label"),
                reason = optionalString(payload, "reason")
            )
        }
    }

    private fun optionalString(json: JSONObject, name: String): String? =
        if (json.has(name) && !json.isNull(name)) json.getString(name) else null

    private fun optionalLong(json: JSONObject, name: String): Long? =
        if (json.has(name) && !json.isNull(name)) json.getLong(name) else null
}
