package org.daovibe.android.ui

import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PacketValidator
import org.daovibe.android.core.protocol.PhraseObservedPayload
import org.daovibe.android.core.protocol.StableJson
import org.daovibe.android.core.protocol.estimatePacketSize
import org.daovibe.android.core.storage.PacketEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class LedgerScreenModelTest {
    @Test
    fun filterMappingUsesExistingPacketTypes() {
        val phrase = packetEntity(observedPacket())

        assertTrue(LedgerPacketFilter.All.matches(phrase))
        assertTrue(LedgerPacketFilter.Phrase.matches(phrase))
        assertFalse(LedgerPacketFilter.MeaningProposal.matches(phrase))
        assertFalse(LedgerPacketFilter.Votes.matches(phrase))
        assertFalse(LedgerPacketFilter.Safety.matches(phrase))
    }

    @Test
    fun previewAndSearchUsePhraseText() {
        val packet = packetEntity(observedPacket(surfaceText = "Break a leg"))

        assertEquals("Break a leg", packetPreview(packet))
        assertTrue(packetMatchesSearch(packet, "break"))
        assertTrue(packetMatchesSearch(packet, "phrase_observed"))
        assertTrue(packetMatchesSearch(packet, "author_a"))
        assertFalse(packetMatchesSearch(packet, "missing phrase"))
    }

    @Test
    fun detailInspectionUsesValidatorResult() {
        val packet = observedPacket()
        val invalid = packet.copy(payloadHash = "not_a_valid_payload_hash")
        val inspection = inspectLedgerPacket(
            packet = packetEntity(invalid),
            nowSeconds = 1_700_000_100L,
            validator = PacketValidator()
        )

        assertEquals(false, inspection.validationPassed)
        assertTrue(inspection.validationErrors.contains("Invalid payload_hash"))
        assertTrue(inspection.validationErrors.contains("Invalid packet_id"))
    }

    @Test
    fun detailInspectionFormatsPayloadJson() {
        val packet = packetEntity(observedPacket(surfaceText = "Readable payload"))
        val inspection = inspectLedgerPacket(packet, nowSeconds = 1_700_000_100L)

        assertEquals(true, inspection.validationPassed)
        assertTrue(inspection.payloadJson.contains("\"surface_text\": \"Readable payload\""))
        assertTrue(inspection.rawPacketJson.contains("\"packet_type\":\"phrase_observed\""))
    }

    @Test
    fun detailInspectionReportsExpirationThroughValidatorHelper() {
        val expired = observedPacket(
            createdAt = 1_700_000_000L,
            expiresAt = 1_700_000_050L
        )
        val inspection = inspectLedgerPacket(
            packet = packetEntity(expired),
            nowSeconds = 1_700_000_100L
        )

        assertEquals(true, inspection.validationPassed)
        assertEquals(true, inspection.expired)
    }

    @Test
    fun packetTypeCountsKeepUnknownTypesSafe() {
        val known = packetEntity(observedPacket())
        val unknown = known.copy(packetId = "unknown_packet", packetType = "future_packet_type")
        val counts = packetTypeCounts(listOf(known, unknown))

        assertEquals(1, counts["phrase_observed"])
        assertEquals(1, counts["future_packet_type"])
    }

    private fun observedPacket(
        surfaceText: String = "Room phrase",
        createdAt: Long = 1_700_000_000L,
        expiresAt: Long? = null
    ) = PacketFactory { createdAt }.create(
        packetType = PacketType.PHRASE_OBSERVED,
        zone = "test_zone",
        author = "author_a",
        payload = PhraseObservedPayload(
            phraseId = "phrase_room",
            surfaceText = surfaceText,
            languageHint = "en",
            inputType = InputType.TEXT
        ),
        expiresAt = expiresAt,
        createdAt = createdAt
    )

    private fun packetEntity(
        packet: org.daovibe.android.core.protocol.LmpPacket<PacketPayload>
    ): PacketEntity {
        val payloadMap = packet.payload.toStableMap()
        val packetSize = estimatePacketSize(packet)

        return PacketEntity(
            packetId = packet.packetId,
            packetType = packet.packetType.wireValue,
            zone = packet.zone,
            author = packet.author,
            parent = packet.parent,
            phraseId = payloadMap["phrase_id"] as? String,
            meaningId = payloadMap["meaning_id"] as? String,
            payloadHash = packet.payloadHash,
            payloadJson = StableJson.stringify(payloadMap),
            packetJson = PacketJsonCodec.encode(packet),
            packetSizeBytes = packetSize.bytes,
            packetSizeClass = packetSize.sizeClass.wireValue,
            sizeRecommendation = packetSize.recommendation,
            createdAt = packet.createdAt,
            receivedAt = packet.createdAt + 100L
        )
    }
}
