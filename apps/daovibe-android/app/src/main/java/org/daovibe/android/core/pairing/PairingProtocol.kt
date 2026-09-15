package org.daovibe.android.core.pairing

import org.daovibe.android.core.protocol.StableJson
import org.daovibe.android.core.protocol.sha256
import java.util.UUID

const val PAIRING_PROTOCOL_VERSION = "daovibe-pairing-v1"

enum class PairingApprovalState(val wireValue: String) {
    APPROVED("approved"),
    REJECTED("rejected");

    companion object {
        fun fromWireValue(value: String): PairingApprovalState? =
            entries.firstOrNull { it.wireValue == value }
    }
}

enum class PairingRecordStatus(val wireValue: String) {
    APPROVED("approved"),
    REJECTED("rejected");

    companion object {
        fun fromWireValue(value: String): PairingRecordStatus? =
            entries.firstOrNull { it.wireValue == value }
    }
}

data class PairingOffer(
    val protocolVersion: String,
    val pairingId: String,
    val sourceNodeId: String,
    val sourceDisplayName: String,
    val sourcePlatform: String,
    val sourceRole: String,
    val createdAt: Long,
    /*
     * Development-only correlation value. It is not proof of identity,
     * authentication, encryption, or authorization.
     */
    val challenge: String?
) {
    fun toStableMap(): Map<String, Any?> = buildMap {
        put("protocol_version", protocolVersion)
        put("pairing_id", pairingId)
        put("source_node_id", sourceNodeId)
        put("source_display_name", sourceDisplayName)
        put("source_platform", sourcePlatform)
        put("source_role", sourceRole)
        put("created_at", createdAt)
        if (challenge != null) put("challenge", challenge)
    }
}

data class PairingApproval(
    val protocolVersion: String,
    val pairingId: String,
    val approvingNodeId: String,
    val approvingDisplayName: String,
    val approvingPlatform: String,
    val approvingRole: String,
    val targetNodeId: String,
    val approvedAt: Long,
    val approvalState: PairingApprovalState,
    /*
     * Development-only echo of PairingOffer.challenge. It is not a
     * cryptographic challenge response.
     */
    val challengeEcho: String?
) {
    fun toStableMap(): Map<String, Any?> = buildMap {
        put("protocol_version", protocolVersion)
        put("pairing_id", pairingId)
        put("approving_node_id", approvingNodeId)
        put("approving_display_name", approvingDisplayName)
        put("approving_platform", approvingPlatform)
        put("approving_role", approvingRole)
        put("target_node_id", targetNodeId)
        put("approved_at", approvedAt)
        put("approval_state", approvalState.wireValue)
        if (challengeEcho != null) put("challenge_echo", challengeEcho)
    }
}

data class PairingRecord(
    val pairingId: String,
    val localNodeId: String,
    val remoteNodeId: String,
    val remoteDisplayName: String,
    val remotePlatform: String,
    val remoteRole: String,
    val status: PairingRecordStatus,
    val createdAt: Long,
    val pairedAt: Long?
)

object PairingProtocol {
    const val ANDROID_PLATFORM = "android"
    const val PHONE_ROLE = "phone"
    const val COMPUTER_ROLE = "computer"

    fun createOffer(
        sourceNodeId: String,
        sourceDisplayName: String,
        sourcePlatform: String = ANDROID_PLATFORM,
        sourceRole: String = PHONE_ROLE,
        createdAt: Long,
        challenge: String = UUID.randomUUID().toString()
    ): PairingOffer {
        val offer = PairingOffer(
            protocolVersion = PAIRING_PROTOCOL_VERSION,
            pairingId = pairingIdFor(
                sourceNodeId = sourceNodeId,
                createdAt = createdAt,
                challenge = challenge
            ),
            sourceNodeId = sourceNodeId,
            sourceDisplayName = sourceDisplayName,
            sourcePlatform = sourcePlatform,
            sourceRole = sourceRole,
            createdAt = createdAt,
            challenge = challenge
        )

        validateOffer(offer)
        return offer
    }

    fun pairingIdFor(
        sourceNodeId: String,
        createdAt: Long,
        challenge: String?
    ): String =
        "pairing_${sha256(
            "$PAIRING_PROTOCOL_VERSION|$sourceNodeId|$createdAt|${challenge.orEmpty()}"
        ).take(24)}"

    fun validateOffer(offer: PairingOffer) {
        require(offer.protocolVersion == PAIRING_PROTOCOL_VERSION) {
            "Unsupported pairing protocol version: ${offer.protocolVersion}"
        }
        requireNonBlank(offer.pairingId, "pairing_id")
        requireNonBlank(offer.sourceNodeId, "source_node_id")
        requireNonBlank(offer.sourceDisplayName, "source_display_name")
        requireNonBlank(offer.sourcePlatform, "source_platform")
        requireNonBlank(offer.sourceRole, "source_role")
        require(offer.createdAt > 0L) { "created_at must be positive" }
        offer.challenge?.let { requireNonBlank(it, "challenge") }
        require(
            offer.pairingId == pairingIdFor(
                sourceNodeId = offer.sourceNodeId,
                createdAt = offer.createdAt,
                challenge = offer.challenge
            )
        ) {
            "pairing_id does not match offer identity"
        }
    }

    fun validateApproval(approval: PairingApproval) {
        require(approval.protocolVersion == PAIRING_PROTOCOL_VERSION) {
            "Unsupported pairing protocol version: ${approval.protocolVersion}"
        }
        requireNonBlank(approval.pairingId, "pairing_id")
        requireNonBlank(approval.approvingNodeId, "approving_node_id")
        requireNonBlank(approval.approvingDisplayName, "approving_display_name")
        requireNonBlank(approval.approvingPlatform, "approving_platform")
        requireNonBlank(approval.approvingRole, "approving_role")
        requireNonBlank(approval.targetNodeId, "target_node_id")
        require(approval.approvedAt > 0L) { "approved_at must be positive" }
    }

    private fun requireNonBlank(value: String, fieldName: String) {
        require(value.trim().isNotEmpty()) {
            "$fieldName must be a non-empty string"
        }
    }
}

fun PairingOffer.toCanonicalJson(): String =
    StableJson.stringify(toStableMap())

fun PairingApproval.toCanonicalJson(): String =
    StableJson.stringify(toStableMap())
