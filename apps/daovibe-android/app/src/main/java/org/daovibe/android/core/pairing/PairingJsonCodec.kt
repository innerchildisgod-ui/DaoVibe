package org.daovibe.android.core.pairing

import org.json.JSONObject

object PairingJsonCodec {
    fun encode(offer: PairingOffer): String {
        PairingProtocol.validateOffer(offer)
        return offer.toCanonicalJson()
    }

    fun decodeOffer(json: String): PairingOffer =
        decodeOffer(JSONObject(json))

    fun decodeOffer(json: JSONObject): PairingOffer {
        val offer = PairingOffer(
            protocolVersion = json.getString("protocol_version"),
            pairingId = json.getString("pairing_id"),
            sourceNodeId = json.getString("source_node_id"),
            sourceDisplayName = json.getString("source_display_name"),
            sourcePlatform = json.getString("source_platform"),
            sourceRole = json.getString("source_role"),
            createdAt = json.getLong("created_at"),
            challenge = optionalString(json, "challenge")
        )
        PairingProtocol.validateOffer(offer)
        return offer
    }

    fun encode(approval: PairingApproval): String {
        PairingProtocol.validateApproval(approval)
        return approval.toCanonicalJson()
    }

    fun decodeApproval(json: String): PairingApproval =
        decodeApproval(JSONObject(json))

    fun decodeApproval(json: JSONObject): PairingApproval {
        val approval = PairingApproval(
            protocolVersion = json.getString("protocol_version"),
            pairingId = json.getString("pairing_id"),
            approvingNodeId = json.getString("approving_node_id"),
            approvingDisplayName = json.getString("approving_display_name"),
            approvingPlatform = json.getString("approving_platform"),
            approvingRole = json.getString("approving_role"),
            targetNodeId = json.getString("target_node_id"),
            approvedAt = json.getLong("approved_at"),
            approvalState = PairingApprovalState.fromWireValue(
                json.getString("approval_state")
            ) ?: error("Invalid approval_state"),
            challengeEcho = optionalString(json, "challenge_echo")
        )
        PairingProtocol.validateApproval(approval)
        return approval
    }

    private fun optionalString(json: JSONObject, name: String): String? =
        if (json.has(name) && !json.isNull(name)) json.getString(name) else null
}
