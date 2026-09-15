package org.daovibe.android.core.pairing

import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class PairingProtocolTest {
    @Test
    fun samePairingDataProducesSameCanonicalMessages() {
        val offer = PairingProtocol.createOffer(
            sourceNodeId = "mycelium_node_phone",
            sourceDisplayName = "Pocket Node",
            sourcePlatform = PairingProtocol.ANDROID_PLATFORM,
            sourceRole = PairingProtocol.PHONE_ROLE,
            createdAt = 1_700_000_000L,
            challenge = "development-challenge"
        )
        val approval = PairingApproval(
            protocolVersion = PAIRING_PROTOCOL_VERSION,
            pairingId = offer.pairingId,
            approvingNodeId = "mycelium_node_computer",
            approvingDisplayName = "Desk Node",
            approvingPlatform = "desktop",
            approvingRole = PairingProtocol.COMPUTER_ROLE,
            targetNodeId = offer.sourceNodeId,
            approvedAt = 1_700_000_001L,
            approvalState = PairingApprovalState.APPROVED,
            challengeEcho = offer.challenge
        )

        assertEquals(
            PairingJsonCodec.encode(offer),
            PairingJsonCodec.encode(PairingJsonCodec.decodeOffer(
                PairingJsonCodec.encode(offer)
            ))
        )
        assertEquals(
            PairingJsonCodec.encode(approval),
            PairingJsonCodec.encode(PairingJsonCodec.decodeApproval(
                PairingJsonCodec.encode(approval)
            ))
        )
        assertEquals(
            offer,
            PairingProtocol.createOffer(
                sourceNodeId = "mycelium_node_phone",
                sourceDisplayName = "Pocket Node",
                sourcePlatform = PairingProtocol.ANDROID_PLATFORM,
                sourceRole = PairingProtocol.PHONE_ROLE,
                createdAt = 1_700_000_000L,
                challenge = "development-challenge"
            )
        )
    }
}
