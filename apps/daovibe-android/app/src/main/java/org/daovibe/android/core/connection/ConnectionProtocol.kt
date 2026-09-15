package org.daovibe.android.core.connection

import org.daovibe.android.core.pairing.PairingRecord
import org.daovibe.android.core.pairing.PairingRecordStatus
import org.daovibe.android.core.protocol.LMP_VERSION
import org.daovibe.android.core.protocol.StableJson
import java.util.UUID

const val CONNECTION_PROTOCOL_VERSION = "daovibe-connection-v1"
const val CONNECTION_SESSION_ID_PREFIX = "session_"

val SUPPORTED_CONNECTION_VERSIONS: Set<String> =
    setOf(CONNECTION_PROTOCOL_VERSION)

val SUPPORTED_PACKET_PROTOCOL_VERSIONS: Set<String> =
    setOf(LMP_VERSION)

val DEFAULT_ANDROID_CONNECTION_CAPABILITIES: Set<ConnectionCapability> =
    setOf(
        ConnectionCapability.MYCELIUM,
        ConnectionCapability.PACKET_LEDGER,
        ConnectionCapability.LEDGER_EXPORT_IMPORT,
        ConnectionCapability.LIGHTWEIGHT_NODE
    )

enum class ConnectionMessageType(val wireValue: String) {
    CONNECTION_HELLO("connection_hello"),
    CONNECTION_ACCEPT("connection_accept"),
    CONNECTION_REJECT("connection_reject");

    companion object {
        fun fromWireValue(value: String): ConnectionMessageType? =
            entries.firstOrNull { it.wireValue == value }
    }
}

enum class ConnectionCapability(val wireValue: String) {
    MYCELIUM("mycelium"),
    PACKET_LEDGER("packet_ledger"),
    LEDGER_EXPORT_IMPORT("ledger_export_import"),
    LIGHTWEIGHT_NODE("lightweight_node"),
    PERSISTENT_STORAGE("persistent_storage"),
    HEAVY_COMPUTE("heavy_compute"),
    CACHE("cache"),
    VERIFICATION("verification"),
    RELAY("relay");

    companion object {
        fun fromWireValue(value: String): ConnectionCapability? =
            entries.firstOrNull { it.wireValue == value }
    }
}

enum class ConnectionSessionState(val wireValue: String) {
    IDLE("idle"),
    CONNECTING("connecting"),
    HELLO_SENT("hello_sent"),
    HELLO_RECEIVED("hello_received"),
    NEGOTIATING("negotiating"),
    CONNECTED("connected"),
    REJECTED("rejected"),
    DISCONNECTED("disconnected"),
    FAILED("failed");

    companion object {
        fun fromWireValue(value: String): ConnectionSessionState? =
            entries.firstOrNull { it.wireValue == value }
    }
}

enum class ConnectionRejectReason(val wireValue: String) {
    INVALID_MESSAGE("invalid_message"),
    MISSING_NODE_ID("missing_node_id"),
    SOURCE_EQUALS_TARGET("source_equals_target"),
    NODE_ID_MISMATCH("node_id_mismatch"),
    TARGET_NODE_MISMATCH("target_node_mismatch"),
    PAIRING_NOT_FOUND("pairing_not_found"),
    PAIRING_INACTIVE("pairing_inactive"),
    PAIRING_PEER_MISMATCH("pairing_peer_mismatch"),
    UNSUPPORTED_CONNECTION_VERSION("unsupported_connection_version"),
    INCOMPATIBLE_CONNECTION_VERSION("incompatible_connection_version"),
    INCOMPATIBLE_PACKET_VERSION("incompatible_packet_version"),
    MALFORMED_CAPABILITIES("malformed_capabilities"),
    MALFORMED_SESSION_ID("malformed_session_id"),
    SESSION_MISMATCH("session_mismatch"),
    DIRECTION_MISMATCH("direction_mismatch");

    companion object {
        fun fromWireValue(value: String): ConnectionRejectReason? =
            entries.firstOrNull { it.wireValue == value }
    }
}

sealed interface ConnectionMessage {
    val messageType: ConnectionMessageType
    val protocolVersion: String

    fun toStableMap(): Map<String, Any?>
}

data class ConnectionHello(
    override val protocolVersion: String,
    val sessionId: String,
    val sourceNodeId: String,
    val targetNodeId: String,
    val sourcePlatform: String,
    val sourceRole: String,
    val pairingId: String,
    val createdAt: Long,
    val supportedConnectionVersions: Set<String>,
    val supportedPacketProtocolVersions: Set<String>,
    val capabilities: Set<ConnectionCapability>
) : ConnectionMessage {
    override val messageType: ConnectionMessageType =
        ConnectionMessageType.CONNECTION_HELLO

    override fun toStableMap(): Map<String, Any?> = linkedMapOf(
        "message_type" to messageType.wireValue,
        "protocol_version" to protocolVersion,
        "session_id" to sessionId,
        "source_node_id" to sourceNodeId,
        "target_node_id" to targetNodeId,
        "source_platform" to sourcePlatform,
        "source_role" to sourceRole,
        "pairing_id" to pairingId,
        "created_at" to createdAt,
        "supported_connection_versions" to
            supportedConnectionVersions.sorted(),
        "supported_packet_protocol_versions" to
            supportedPacketProtocolVersions.sorted(),
        "capabilities" to capabilities
            .sortedBy { it.wireValue }
            .map { it.wireValue }
    )
}

data class ConnectionAccept(
    override val protocolVersion: String,
    val sessionId: String,
    val sourceNodeId: String,
    val targetNodeId: String,
    val pairingId: String,
    val acceptedAt: Long,
    val negotiatedConnectionVersion: String,
    val negotiatedPacketProtocolVersion: String,
    val capabilities: Set<ConnectionCapability>,
    val state: ConnectionSessionState
) : ConnectionMessage {
    override val messageType: ConnectionMessageType =
        ConnectionMessageType.CONNECTION_ACCEPT

    override fun toStableMap(): Map<String, Any?> = linkedMapOf(
        "message_type" to messageType.wireValue,
        "protocol_version" to protocolVersion,
        "session_id" to sessionId,
        "source_node_id" to sourceNodeId,
        "target_node_id" to targetNodeId,
        "pairing_id" to pairingId,
        "accepted_at" to acceptedAt,
        "negotiated_connection_version" to negotiatedConnectionVersion,
        "negotiated_packet_protocol_version" to negotiatedPacketProtocolVersion,
        "capabilities" to capabilities
            .sortedBy { it.wireValue }
            .map { it.wireValue },
        "state" to state.wireValue
    )
}

data class ConnectionReject(
    override val protocolVersion: String,
    val sessionId: String,
    val sourceNodeId: String,
    val targetNodeId: String,
    val pairingId: String,
    val rejectedAt: Long,
    val reasonCode: ConnectionRejectReason
) : ConnectionMessage {
    override val messageType: ConnectionMessageType =
        ConnectionMessageType.CONNECTION_REJECT

    override fun toStableMap(): Map<String, Any?> = linkedMapOf(
        "message_type" to messageType.wireValue,
        "protocol_version" to protocolVersion,
        "session_id" to sessionId,
        "source_node_id" to sourceNodeId,
        "target_node_id" to targetNodeId,
        "pairing_id" to pairingId,
        "rejected_at" to rejectedAt,
        "reason_code" to reasonCode.wireValue
    )
}

data class ConnectionSession(
    val sessionId: String,
    val localNodeId: String,
    val remoteNodeId: String,
    val pairingId: String,
    val state: ConnectionSessionState,
    val negotiatedConnectionVersion: String? = null,
    val negotiatedPacketProtocolVersion: String? = null,
    val localCapabilities: Set<ConnectionCapability> = emptySet(),
    val remoteCapabilities: Set<ConnectionCapability> = emptySet(),
    val negotiatedCapabilities: Set<ConnectionCapability> = emptySet(),
    val rejectReason: ConnectionRejectReason? = null,
    val transportFailure: PeerTransportFailure? = null
)

class ConnectionProtocolException(
    val reason: ConnectionRejectReason,
    message: String
) : IllegalArgumentException(message)

object ConnectionProtocol {
    fun createSessionId(uuid: UUID = UUID.randomUUID()): String =
        CONNECTION_SESSION_ID_PREFIX +
            uuid.toString().replace("-", "").lowercase()

    fun validateSessionId(sessionId: String) {
        if (!Regex("^${CONNECTION_SESSION_ID_PREFIX}[a-f0-9]{32}$")
                .matches(sessionId)
        ) {
            reject(
                ConnectionRejectReason.MALFORMED_SESSION_ID,
                "Malformed session_id"
            )
        }
    }

    fun createHello(
        localNodeId: String,
        pairing: PairingRecord,
        sourcePlatform: String,
        sourceRole: String,
        sessionId: String,
        createdAt: Long,
        supportedConnectionVersions: Set<String> =
            SUPPORTED_CONNECTION_VERSIONS,
        supportedPacketProtocolVersions: Set<String> =
            SUPPORTED_PACKET_PROTOCOL_VERSIONS,
        capabilities: Set<ConnectionCapability> =
            DEFAULT_ANDROID_CONNECTION_CAPABILITIES
    ): ConnectionHello {
        requireActivePairing(
            pairing = pairing,
            localNodeId = localNodeId,
            remoteNodeId = pairing.remoteNodeId
        )

        val hello = ConnectionHello(
            protocolVersion = CONNECTION_PROTOCOL_VERSION,
            sessionId = sessionId,
            sourceNodeId = localNodeId,
            targetNodeId = pairing.remoteNodeId,
            sourcePlatform = sourcePlatform,
            sourceRole = sourceRole,
            pairingId = pairing.pairingId,
            createdAt = createdAt,
            supportedConnectionVersions = supportedConnectionVersions,
            supportedPacketProtocolVersions = supportedPacketProtocolVersions,
            capabilities = capabilities
        )
        validateHello(hello)
        return hello
    }

    fun validateHello(hello: ConnectionHello) {
        requireProtocolVersion(hello.protocolVersion)
        validateSessionId(hello.sessionId)
        requireNodeId(hello.sourceNodeId, "source_node_id")
        requireNodeId(hello.targetNodeId, "target_node_id")
        if (hello.sourceNodeId == hello.targetNodeId) {
            reject(
                ConnectionRejectReason.SOURCE_EQUALS_TARGET,
                "source_node_id must differ from target_node_id"
            )
        }
        requireNonBlank(hello.sourcePlatform, "source_platform")
        requireNonBlank(hello.sourceRole, "source_role")
        requireNonBlank(hello.pairingId, "pairing_id")
        requirePositive(hello.createdAt, "created_at")
        validateVersionSet(
            values = hello.supportedConnectionVersions,
            fieldName = "supported_connection_versions",
            reason = ConnectionRejectReason.INCOMPATIBLE_CONNECTION_VERSION
        )
        validateVersionSet(
            values = hello.supportedPacketProtocolVersions,
            fieldName = "supported_packet_protocol_versions",
            reason = ConnectionRejectReason.INCOMPATIBLE_PACKET_VERSION
        )
        validateCapabilities(hello.capabilities, requireAtLeastOne = true)

        if (CONNECTION_PROTOCOL_VERSION !in hello.supportedConnectionVersions) {
            reject(
                ConnectionRejectReason.INCOMPATIBLE_CONNECTION_VERSION,
                "Hello does not advertise the current connection version"
            )
        }
        if (LMP_VERSION !in hello.supportedPacketProtocolVersions) {
            reject(
                ConnectionRejectReason.INCOMPATIBLE_PACKET_VERSION,
                "Hello does not advertise the current packet protocol version"
            )
        }
    }

    fun validateHelloForLocalPeer(
        hello: ConnectionHello,
        localNodeId: String,
        pairing: PairingRecord?
    ) {
        validateHello(hello)
        requireNodeId(localNodeId, "local_node_id")
        requireActivePairing(
            pairing = pairing,
            localNodeId = localNodeId,
            remoteNodeId = hello.sourceNodeId
        )

        if (hello.targetNodeId != localNodeId) {
            reject(
                ConnectionRejectReason.TARGET_NODE_MISMATCH,
                "Hello targets another local node"
            )
        }
        if (pairing?.pairingId != hello.pairingId) {
            reject(
                ConnectionRejectReason.PAIRING_PEER_MISMATCH,
                "Hello pairing_id does not match the local pairing"
            )
        }
        if (pairing?.remoteNodeId != hello.sourceNodeId) {
            reject(
                ConnectionRejectReason.PAIRING_PEER_MISMATCH,
                "Hello source_node_id does not match the paired remote node"
            )
        }
    }

    fun createAccept(
        hello: ConnectionHello,
        localNodeId: String,
        pairing: PairingRecord?,
        acceptedAt: Long,
        localSupportedConnectionVersions: Set<String> =
            SUPPORTED_CONNECTION_VERSIONS,
        localSupportedPacketProtocolVersions: Set<String> =
            SUPPORTED_PACKET_PROTOCOL_VERSIONS,
        localCapabilities: Set<ConnectionCapability> =
            DEFAULT_ANDROID_CONNECTION_CAPABILITIES
    ): ConnectionAccept {
        validateHelloForLocalPeer(
            hello = hello,
            localNodeId = localNodeId,
            pairing = pairing
        )

        val negotiatedConnectionVersion = negotiateConnectionVersion(
            localSupported = localSupportedConnectionVersions,
            remoteSupported = hello.supportedConnectionVersions
        )
        val negotiatedPacketVersion = negotiatePacketProtocolVersion(
            localSupported = localSupportedPacketProtocolVersions,
            remoteSupported = hello.supportedPacketProtocolVersions
        )
        validateCapabilities(localCapabilities, requireAtLeastOne = true)

        val accept = ConnectionAccept(
            protocolVersion = CONNECTION_PROTOCOL_VERSION,
            sessionId = hello.sessionId,
            sourceNodeId = localNodeId,
            targetNodeId = hello.sourceNodeId,
            pairingId = hello.pairingId,
            acceptedAt = acceptedAt,
            negotiatedConnectionVersion = negotiatedConnectionVersion,
            negotiatedPacketProtocolVersion = negotiatedPacketVersion,
            capabilities = negotiateCapabilities(
                localCapabilities = localCapabilities,
                remoteCapabilities = hello.capabilities
            ),
            state = ConnectionSessionState.CONNECTED
        )
        validateAccept(accept)
        return accept
    }

    fun validateAccept(accept: ConnectionAccept) {
        requireProtocolVersion(accept.protocolVersion)
        validateSessionId(accept.sessionId)
        requireNodeId(accept.sourceNodeId, "source_node_id")
        requireNodeId(accept.targetNodeId, "target_node_id")
        if (accept.sourceNodeId == accept.targetNodeId) {
            reject(
                ConnectionRejectReason.SOURCE_EQUALS_TARGET,
                "source_node_id must differ from target_node_id"
            )
        }
        requireNonBlank(accept.pairingId, "pairing_id")
        requirePositive(accept.acceptedAt, "accepted_at")
        requireNonBlank(
            accept.negotiatedConnectionVersion,
            "negotiated_connection_version"
        )
        requireNonBlank(
            accept.negotiatedPacketProtocolVersion,
            "negotiated_packet_protocol_version"
        )
        if (accept.negotiatedConnectionVersion !in SUPPORTED_CONNECTION_VERSIONS) {
            reject(
                ConnectionRejectReason.INCOMPATIBLE_CONNECTION_VERSION,
                "Unsupported negotiated connection version"
            )
        }
        if (accept.negotiatedPacketProtocolVersion !in
            SUPPORTED_PACKET_PROTOCOL_VERSIONS
        ) {
            reject(
                ConnectionRejectReason.INCOMPATIBLE_PACKET_VERSION,
                "Unsupported negotiated packet protocol version"
            )
        }
        if (accept.state != ConnectionSessionState.CONNECTED) {
            reject(
                ConnectionRejectReason.INVALID_MESSAGE,
                "Connection accept must declare connected state"
            )
        }
        validateCapabilities(accept.capabilities, requireAtLeastOne = false)
    }

    fun validateAcceptForHello(
        hello: ConnectionHello,
        accept: ConnectionAccept,
        localNodeId: String,
        pairing: PairingRecord?,
        localSupportedConnectionVersions: Set<String> =
            SUPPORTED_CONNECTION_VERSIONS,
        localSupportedPacketProtocolVersions: Set<String> =
            SUPPORTED_PACKET_PROTOCOL_VERSIONS,
        localCapabilities: Set<ConnectionCapability> =
            DEFAULT_ANDROID_CONNECTION_CAPABILITIES
    ) {
        validateHello(hello)
        validateAccept(accept)
        requireNodeId(localNodeId, "local_node_id")
        validateCapabilities(localCapabilities, requireAtLeastOne = true)
        requireActivePairing(
            pairing = pairing,
            localNodeId = localNodeId,
            remoteNodeId = hello.targetNodeId
        )

        if (hello.sourceNodeId != localNodeId ||
            hello.targetNodeId != pairing?.remoteNodeId
        ) {
            reject(
                ConnectionRejectReason.NODE_ID_MISMATCH,
                "Hello direction does not match the local pairing"
            )
        }
        if (accept.sessionId != hello.sessionId) {
            reject(
                ConnectionRejectReason.SESSION_MISMATCH,
                "Accept session_id does not match hello"
            )
        }
        if (accept.pairingId != hello.pairingId ||
            accept.pairingId != pairing?.pairingId
        ) {
            reject(
                ConnectionRejectReason.PAIRING_PEER_MISMATCH,
                "Accept pairing_id does not match hello"
            )
        }
        if (
            accept.sourceNodeId != hello.targetNodeId ||
            accept.targetNodeId != hello.sourceNodeId
        ) {
            reject(
                ConnectionRejectReason.DIRECTION_MISMATCH,
                "Accept node ID direction does not match hello"
            )
        }
        if (accept.negotiatedConnectionVersion !in
            localSupportedConnectionVersions ||
            accept.negotiatedConnectionVersion !in
            hello.supportedConnectionVersions
        ) {
            reject(
                ConnectionRejectReason.INCOMPATIBLE_CONNECTION_VERSION,
                "Accept chose an unsupported connection version"
            )
        }
        if (accept.negotiatedPacketProtocolVersion !in
            localSupportedPacketProtocolVersions ||
            accept.negotiatedPacketProtocolVersion !in
            hello.supportedPacketProtocolVersions
        ) {
            reject(
                ConnectionRejectReason.INCOMPATIBLE_PACKET_VERSION,
                "Accept chose an unsupported packet protocol version"
            )
        }
        if (!accept.capabilities.all {
                it in hello.capabilities && it in localCapabilities
            }
        ) {
            reject(
                ConnectionRejectReason.MALFORMED_CAPABILITIES,
                "Accept capabilities must be supported locally and advertised by the hello"
            )
        }
    }

    fun validateReject(rejectMessage: ConnectionReject) {
        requireProtocolVersion(rejectMessage.protocolVersion)
        validateSessionId(rejectMessage.sessionId)
        requireNodeId(rejectMessage.sourceNodeId, "source_node_id")
        requireNodeId(rejectMessage.targetNodeId, "target_node_id")
        if (rejectMessage.sourceNodeId == rejectMessage.targetNodeId) {
            reject(
                ConnectionRejectReason.SOURCE_EQUALS_TARGET,
                "source_node_id must differ from target_node_id"
            )
        }
        requireNonBlank(rejectMessage.pairingId, "pairing_id")
        requirePositive(rejectMessage.rejectedAt, "rejected_at")
    }

    fun validateRejectForHello(
        hello: ConnectionHello,
        rejectMessage: ConnectionReject,
        localNodeId: String,
        pairing: PairingRecord?
    ) {
        validateHello(hello)
        validateReject(rejectMessage)
        requireNodeId(localNodeId, "local_node_id")
        requireActivePairing(
            pairing = pairing,
            localNodeId = localNodeId,
            remoteNodeId = hello.targetNodeId
        )

        if (hello.sourceNodeId != localNodeId ||
            hello.targetNodeId != pairing?.remoteNodeId
        ) {
            reject(
                ConnectionRejectReason.NODE_ID_MISMATCH,
                "Hello direction does not match the local pairing"
            )
        }
        if (rejectMessage.sessionId != hello.sessionId) {
            reject(
                ConnectionRejectReason.SESSION_MISMATCH,
                "Reject session_id does not match hello"
            )
        }
        if (rejectMessage.pairingId != hello.pairingId ||
            rejectMessage.pairingId != pairing?.pairingId
        ) {
            reject(
                ConnectionRejectReason.PAIRING_PEER_MISMATCH,
                "Reject pairing_id does not match hello"
            )
        }
        if (
            rejectMessage.sourceNodeId != hello.targetNodeId ||
            rejectMessage.targetNodeId != hello.sourceNodeId
        ) {
            reject(
                ConnectionRejectReason.DIRECTION_MISMATCH,
                "Reject node ID direction does not match hello"
            )
        }
    }

    fun createReject(
        sessionId: String,
        sourceNodeId: String,
        targetNodeId: String,
        pairingId: String,
        rejectedAt: Long,
        reason: ConnectionRejectReason
    ): ConnectionReject {
        val rejectMessage = ConnectionReject(
            protocolVersion = CONNECTION_PROTOCOL_VERSION,
            sessionId = sessionId,
            sourceNodeId = sourceNodeId,
            targetNodeId = targetNodeId,
            pairingId = pairingId,
            rejectedAt = rejectedAt,
            reasonCode = reason
        )
        validateReject(rejectMessage)
        return rejectMessage
    }

    fun negotiateConnectionVersion(
        localSupported: Set<String>,
        remoteSupported: Set<String>
    ): String {
        validateVersionSet(
            values = localSupported,
            fieldName = "local_supported_connection_versions",
            reason = ConnectionRejectReason.INCOMPATIBLE_CONNECTION_VERSION
        )
        validateVersionSet(
            values = remoteSupported,
            fieldName = "remote_supported_connection_versions",
            reason = ConnectionRejectReason.INCOMPATIBLE_CONNECTION_VERSION
        )

        return SUPPORTED_CONNECTION_VERSIONS
            .sorted()
            .firstOrNull { it in localSupported && it in remoteSupported }
            ?: reject(
                ConnectionRejectReason.INCOMPATIBLE_CONNECTION_VERSION,
                "No compatible connection protocol version"
            )
    }

    fun negotiatePacketProtocolVersion(
        localSupported: Set<String>,
        remoteSupported: Set<String>
    ): String {
        validateVersionSet(
            values = localSupported,
            fieldName = "local_supported_packet_protocol_versions",
            reason = ConnectionRejectReason.INCOMPATIBLE_PACKET_VERSION
        )
        validateVersionSet(
            values = remoteSupported,
            fieldName = "remote_supported_packet_protocol_versions",
            reason = ConnectionRejectReason.INCOMPATIBLE_PACKET_VERSION
        )

        return SUPPORTED_PACKET_PROTOCOL_VERSIONS
            .sorted()
            .firstOrNull { it in localSupported && it in remoteSupported }
            ?: reject(
                ConnectionRejectReason.INCOMPATIBLE_PACKET_VERSION,
                "No compatible packet protocol version"
            )
    }

    fun negotiateCapabilities(
        localCapabilities: Set<ConnectionCapability>,
        remoteCapabilities: Set<ConnectionCapability>
    ): Set<ConnectionCapability> {
        validateCapabilities(localCapabilities, requireAtLeastOne = true)
        validateCapabilities(remoteCapabilities, requireAtLeastOne = true)
        return localCapabilities.intersect(remoteCapabilities)
    }

    private fun requireActivePairing(
        pairing: PairingRecord?,
        localNodeId: String,
        remoteNodeId: String
    ) {
        if (pairing == null) {
            reject(
                ConnectionRejectReason.PAIRING_NOT_FOUND,
                "No local pairing record exists"
            )
        }
        if (pairing.status != PairingRecordStatus.APPROVED) {
            reject(
                ConnectionRejectReason.PAIRING_INACTIVE,
                "The local pairing is not active"
            )
        }
        if (pairing.localNodeId != localNodeId) {
            reject(
                ConnectionRejectReason.NODE_ID_MISMATCH,
                "Pairing belongs to another local node"
            )
        }
        if (pairing.remoteNodeId != remoteNodeId) {
            reject(
                ConnectionRejectReason.PAIRING_PEER_MISMATCH,
                "Pairing remote node does not match the peer"
            )
        }
    }

    private fun requireProtocolVersion(protocolVersion: String) {
        if (protocolVersion != CONNECTION_PROTOCOL_VERSION) {
            reject(
                ConnectionRejectReason.UNSUPPORTED_CONNECTION_VERSION,
                "Unsupported connection protocol version: $protocolVersion"
            )
        }
    }

    private fun requireNodeId(value: String, fieldName: String) {
        if (value.trim().isEmpty()) {
            reject(
                ConnectionRejectReason.MISSING_NODE_ID,
                "$fieldName must be a non-empty string"
            )
        }
    }

    private fun requireNonBlank(value: String, fieldName: String) {
        if (value.trim().isEmpty()) {
            reject(
                ConnectionRejectReason.INVALID_MESSAGE,
                "$fieldName must be a non-empty string"
            )
        }
    }

    private fun requirePositive(value: Long, fieldName: String) {
        if (value <= 0L) {
            reject(
                ConnectionRejectReason.INVALID_MESSAGE,
                "$fieldName must be positive"
            )
        }
    }

    private fun validateVersionSet(
        values: Set<String>,
        fieldName: String,
        reason: ConnectionRejectReason
    ) {
        if (values.isEmpty() || values.any { it.trim().isEmpty() }) {
            reject(reason, "$fieldName must contain non-empty versions")
        }
    }

    private fun validateCapabilities(
        capabilities: Set<ConnectionCapability>,
        requireAtLeastOne: Boolean
    ) {
        if (requireAtLeastOne && capabilities.isEmpty()) {
            reject(
                ConnectionRejectReason.MALFORMED_CAPABILITIES,
                "capabilities must contain at least one capability"
            )
        }
    }

    private fun reject(
        reason: ConnectionRejectReason,
        message: String
    ): Nothing = throw ConnectionProtocolException(reason, message)
}

fun ConnectionMessage.toCanonicalJson(): String =
    StableJson.stringify(toStableMap())
