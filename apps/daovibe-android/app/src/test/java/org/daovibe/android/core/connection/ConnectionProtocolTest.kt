package org.daovibe.android.core.connection

import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.daovibe.android.core.pairing.PairingRecord
import org.daovibe.android.core.pairing.PairingRecordStatus
import org.daovibe.android.core.protocol.LMP_VERSION
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ConnectionProtocolTest {
    @Test
    fun validHelloParsesDeterministically() {
        val hello = hello()
        val encoded = ConnectionJsonCodec.encode(hello)
        val decoded = ConnectionJsonCodec.decodeHello(encoded)

        assertEquals(hello, decoded)
        assertEquals(encoded, ConnectionJsonCodec.encode(decoded))
    }

    @Test
    fun connectionMessageCanonicalEncodingIsDeterministic() {
        val first = hello(
            capabilities = linkedSetOf(
                ConnectionCapability.PACKET_LEDGER,
                ConnectionCapability.MYCELIUM
            )
        )
        val second = hello(
            capabilities = linkedSetOf(
                ConnectionCapability.MYCELIUM,
                ConnectionCapability.PACKET_LEDGER
            )
        )

        assertEquals(
            ConnectionJsonCodec.encode(first),
            ConnectionJsonCodec.encode(second)
        )
    }

    @Test
    fun sourceNodeIdCannotEqualTargetNodeId() {
        assertRejectReason(ConnectionRejectReason.SOURCE_EQUALS_TARGET) {
            ConnectionProtocol.validateHello(
                hello().copy(targetNodeId = PHONE_NODE)
            )
        }
    }

    @Test
    fun targetNodeIdMismatchIsRejected() {
        assertRejectReason(ConnectionRejectReason.TARGET_NODE_MISMATCH) {
            ConnectionProtocol.validateHelloForLocalPeer(
                hello = hello().copy(targetNodeId = "mycelium_node_wrong"),
                localNodeId = COMPUTER_NODE,
                pairing = mirroredPairing()
            )
        }
    }

    @Test
    fun unknownPairingIsRejected() {
        assertRejectReason(ConnectionRejectReason.PAIRING_NOT_FOUND) {
            ConnectionProtocol.validateHelloForLocalPeer(
                hello = hello(),
                localNodeId = COMPUTER_NODE,
                pairing = null
            )
        }
    }

    @Test
    fun rejectedPairingIsRejectedAsInactive() {
        assertRejectReason(ConnectionRejectReason.PAIRING_INACTIVE) {
            ConnectionProtocol.validateHelloForLocalPeer(
                hello = hello(),
                localNodeId = COMPUTER_NODE,
                pairing = mirroredPairing(status = PairingRecordStatus.REJECTED)
            )
        }
    }

    @Test
    fun activePairingPermitsHandshakeProgression() {
        val accept = ConnectionProtocol.createAccept(
            hello = hello(),
            localNodeId = COMPUTER_NODE,
            pairing = mirroredPairing(),
            acceptedAt = ACCEPTED_AT,
            localCapabilities = setOf(
                ConnectionCapability.MYCELIUM,
                ConnectionCapability.PACKET_LEDGER,
                ConnectionCapability.PERSISTENT_STORAGE
            )
        )

        assertEquals(ConnectionSessionState.CONNECTED, accept.state)
        assertEquals(CONNECTION_PROTOCOL_VERSION, accept.negotiatedConnectionVersion)
        assertEquals(LMP_VERSION, accept.negotiatedPacketProtocolVersion)
        assertEquals(
            setOf(
                ConnectionCapability.MYCELIUM,
                ConnectionCapability.PACKET_LEDGER
            ),
            accept.capabilities
        )
    }

    @Test
    fun unsupportedProtocolVersionIsRejected() {
        assertRejectReason(ConnectionRejectReason.UNSUPPORTED_CONNECTION_VERSION) {
            ConnectionProtocol.validateHello(
                hello().copy(protocolVersion = "daovibe-connection-v99")
            )
        }
    }

    @Test
    fun compatibleConnectionVersionIsNegotiated() {
        assertEquals(
            CONNECTION_PROTOCOL_VERSION,
            ConnectionProtocol.negotiateConnectionVersion(
                localSupported = setOf("future-version", CONNECTION_PROTOCOL_VERSION),
                remoteSupported = setOf(CONNECTION_PROTOCOL_VERSION)
            )
        )
    }

    @Test
    fun incompatibleConnectionVersionSetIsRejected() {
        assertRejectReason(ConnectionRejectReason.INCOMPATIBLE_CONNECTION_VERSION) {
            ConnectionProtocol.negotiateConnectionVersion(
                localSupported = setOf("future-version"),
                remoteSupported = setOf("future-version")
            )
        }
    }

    @Test
    fun incompatiblePacketProtocolVersionSetIsRejected() {
        assertRejectReason(ConnectionRejectReason.INCOMPATIBLE_PACKET_VERSION) {
            ConnectionProtocol.negotiatePacketProtocolVersion(
                localSupported = setOf("lmp/9.9"),
                remoteSupported = setOf("lmp/9.9")
            )
        }
    }

    @Test
    fun acceptSessionIdMismatchIsRejected() {
        val accept = ConnectionProtocol.createAccept(
            hello = hello(),
            localNodeId = COMPUTER_NODE,
            pairing = mirroredPairing(),
            acceptedAt = ACCEPTED_AT
        )

        assertRejectReason(ConnectionRejectReason.SESSION_MISMATCH) {
            ConnectionProtocol.validateAcceptForHello(
                hello = hello(),
                accept = accept.copy(
                    sessionId = "session_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                ),
                localNodeId = PHONE_NODE,
                pairing = phonePairing()
            )
        }
    }

    @Test
    fun acceptMessageDirectionIsValidated() {
        val accept = ConnectionProtocol.createAccept(
            hello = hello(),
            localNodeId = COMPUTER_NODE,
            pairing = mirroredPairing(),
            acceptedAt = ACCEPTED_AT
        )

        assertRejectReason(ConnectionRejectReason.DIRECTION_MISMATCH) {
            ConnectionProtocol.validateAcceptForHello(
                hello = hello(),
                accept = accept.copy(
                    sourceNodeId = PHONE_NODE,
                    targetNodeId = COMPUTER_NODE
                ),
                localNodeId = PHONE_NODE,
                pairing = phonePairing()
            )
        }
    }

    @Test
    fun acceptedCapabilitiesMustBeSupportedLocallyAndAdvertisedRemotely() {
        val hello = hello(
            capabilities = setOf(
                ConnectionCapability.MYCELIUM,
                ConnectionCapability.HEAVY_COMPUTE
            )
        )
        val accept = ConnectionProtocol.createAccept(
            hello = hello,
            localNodeId = COMPUTER_NODE,
            pairing = mirroredPairing(),
            acceptedAt = ACCEPTED_AT,
            localCapabilities = setOf(
                ConnectionCapability.MYCELIUM,
                ConnectionCapability.HEAVY_COMPUTE
            )
        )

        assertRejectReason(ConnectionRejectReason.MALFORMED_CAPABILITIES) {
            ConnectionProtocol.validateAcceptForHello(
                hello = hello,
                accept = accept,
                localNodeId = PHONE_NODE,
                pairing = phonePairing(),
                localCapabilities = setOf(ConnectionCapability.MYCELIUM)
            )
        }
    }

    @Test
    fun capabilitiesRoundTripDeterministically() {
        val hello = hello(
            capabilities = setOf(
                ConnectionCapability.HEAVY_COMPUTE,
                ConnectionCapability.CACHE,
                ConnectionCapability.MYCELIUM
            )
        )
        val encoded = ConnectionJsonCodec.encode(hello)
        val decoded = ConnectionJsonCodec.decodeHello(encoded)

        assertEquals(hello.capabilities, decoded.capabilities)
        assertEquals(encoded, ConnectionJsonCodec.encode(decoded))
    }

    @Test
    fun malformedCapabilitiesAreRejected() {
        val malformed = ConnectionJsonCodec.encode(hello())
            .replace(
                """"capabilities":["ledger_export_import","lightweight_node","mycelium","packet_ledger"]""",
                """"capabilities":["mycelium","mycelium"]"""
            )

        val result = runCatching {
            ConnectionJsonCodec.decodeHello(malformed)
        }

        assertTrue(result.isFailure)
    }

    @Test
    fun capabilitiesDoNotGrantAuthorizationByThemselves() {
        assertRejectReason(ConnectionRejectReason.PAIRING_NOT_FOUND) {
            ConnectionProtocol.validateHelloForLocalPeer(
                hello = hello(
                    capabilities = setOf(
                        ConnectionCapability.HEAVY_COMPUTE,
                        ConnectionCapability.RELAY,
                        ConnectionCapability.VERIFICATION
                    )
                ),
                localNodeId = COMPUTER_NODE,
                pairing = null
            )
        }
    }

    @Test
    fun malformedSessionIdIsRejected() {
        assertRejectReason(ConnectionRejectReason.MALFORMED_SESSION_ID) {
            ConnectionProtocol.validateHello(
                hello().copy(sessionId = "pairing_1234")
            )
        }
    }

    @Test
    fun twoIndependentProtocolRunsNegotiateTheSameResult() {
        val first = ConnectionProtocol.createAccept(
            hello = hello(),
            localNodeId = COMPUTER_NODE,
            pairing = mirroredPairing(),
            acceptedAt = ACCEPTED_AT
        )
        val second = ConnectionProtocol.createAccept(
            hello = hello(),
            localNodeId = COMPUTER_NODE,
            pairing = mirroredPairing(),
            acceptedAt = ACCEPTED_AT
        )

        assertEquals(first, second)
        assertEquals(
            ConnectionJsonCodec.encode(first),
            ConnectionJsonCodec.encode(second)
        )
    }

    private fun hello(
        capabilities: Set<ConnectionCapability> =
            DEFAULT_ANDROID_CONNECTION_CAPABILITIES
    ): ConnectionHello =
        ConnectionProtocol.createHello(
            localNodeId = PHONE_NODE,
            pairing = phonePairing(),
            sourcePlatform = "android",
            sourceRole = "phone",
            sessionId = SESSION_ID,
            createdAt = CREATED_AT,
            capabilities = capabilities
        )

    private fun phonePairing(
        status: PairingRecordStatus = PairingRecordStatus.APPROVED
    ): PairingRecord =
        pairing(
            localNodeId = PHONE_NODE,
            remoteNodeId = COMPUTER_NODE,
            status = status
        )

    private fun mirroredPairing(
        status: PairingRecordStatus = PairingRecordStatus.APPROVED
    ): PairingRecord =
        pairing(
            localNodeId = COMPUTER_NODE,
            remoteNodeId = PHONE_NODE,
            status = status
        )

    private fun pairing(
        localNodeId: String,
        remoteNodeId: String,
        status: PairingRecordStatus
    ): PairingRecord =
        PairingRecord(
            pairingId = PAIRING_ID,
            localNodeId = localNodeId,
            remoteNodeId = remoteNodeId,
            remoteDisplayName = "Remote Node",
            remotePlatform = "desktop",
            remoteRole = "computer",
            status = status,
            createdAt = CREATED_AT,
            pairedAt = ACCEPTED_AT
        )

    private fun assertRejectReason(
        reason: ConnectionRejectReason,
        block: () -> Unit
    ) {
        val error = runCatching { block() }.exceptionOrNull()

        assertTrue(error is ConnectionProtocolException)
        assertEquals(reason, (error as ConnectionProtocolException).reason)
    }

    private companion object {
        const val PHONE_NODE = "mycelium_node_phone"
        const val COMPUTER_NODE = "mycelium_node_computer"
        const val PAIRING_ID = "pairing_connection_001"
        const val SESSION_ID = "session_0123456789abcdef0123456789abcdef"
        const val CREATED_AT = 1_700_000_000L
        const val ACCEPTED_AT = 1_700_000_001L
    }
}
