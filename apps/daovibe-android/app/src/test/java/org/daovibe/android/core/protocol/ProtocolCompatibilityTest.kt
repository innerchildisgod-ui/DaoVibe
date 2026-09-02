package org.daovibe.android.core.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtocolCompatibilityTest {
    private val factory = PacketFactory { 1_700_000_000L }

    @Test
    fun canonicalJsonIsStableAndSortsObjectKeys() {
        val value = linkedMapOf(
            "z" to 1,
            "a" to linkedMapOf(
                "b" to true,
                "a" to listOf("one", 2)
            )
        )

        assertEquals(
            """{"a":{"a":["one",2],"b":true},"z":1}""",
            StableJson.stringify(value)
        )
    }

    @Test
    fun phraseObservedHashMatchesTypeScriptGolden() {
        val payload = PhraseObservedPayload(
            phraseId = "phrase_001",
            surfaceText = "Vanakkam",
            languageHint = "ta",
            inputType = InputType.TEXT
        )
        val packet = factory.create(
            packetType = PacketType.PHRASE_OBSERVED,
            zone = "test_zone",
            author = "author_a",
            payload = payload,
            createdAt = 1_700_000_000L
        )

        assertEquals(
            """{"input_type":"text","language_hint":"ta","phrase_id":"phrase_001","surface_text":"Vanakkam"}""",
            StableJson.stringify(payload.toStableMap())
        )
        assertEquals(
            "c08b2acb3e86e6f08ba00800fd871284bf65547b16eaea365e5b76df49527cc7",
            packet.payloadHash
        )
        assertEquals(
            "3d2a3515fd52095a09a9f1447cece3ef4b763bee9b1dc4d35af1e85711de52e7",
            packet.packetId
        )
        assertEquals(
            "dev_signature:author_a:3d2a3515fd52095a09a9f1447cece3ef4b763bee9b1dc4d35af1e85711de52e7",
            packet.signature
        )
    }

    @Test
    fun meaningProposalAndVoteHashesMatchTypeScriptGolden() {
        val parent = "3d2a3515fd52095a09a9f1447cece3ef4b763bee9b1dc4d35af1e85711de52e7"
        val proposal = factory.create(
            packetType = PacketType.MEANING_PROPOSAL,
            zone = "test_zone",
            author = "author_a",
            parent = parent,
            payload = MeaningProposalPayload(
                phraseId = "phrase_001",
                meaningId = "meaning_001",
                referenceMeaning = "hello",
                context = "greeting",
                confidence = 0.25
            ),
            createdAt = 1_700_000_001L
        )
        val vote = factory.create(
            packetType = PacketType.MEANING_VOTE,
            zone = "test_zone",
            author = "author_a",
            payload = MeaningVotePayload(
                phraseId = "phrase_001",
                meaningId = "meaning_001",
                vote = VoteValue.CONFIRM,
                confidence = 1.0
            ),
            createdAt = 1_700_000_002L
        )

        assertEquals(
            "4a3e096ad40c5d4299ce1fbaf633f6d6850ccac7bcf0a26dbb18993534128c9a",
            proposal.payloadHash
        )
        assertEquals(
            "5b2f7cce757959871b06ca901c918e7f8da44ae6f7a203725453bf4240b91561",
            proposal.packetId
        )
        assertEquals(
            "c7c7f513c05b4c42a19c349f50c626ff464c140088fb5e35b4d46fa6b5f0d236",
            vote.payloadHash
        )
        assertEquals(
            "c7e6ba31a5597e38b425f7ad73732e516a9f59d31489724cb4245729de28b4dd",
            vote.packetId
        )
    }

    @Test
    fun invalidPayloadHashIsRejected() {
        val packet = factory.create(
            packetType = PacketType.PHRASE_OBSERVED,
            zone = "test_zone",
            author = "author_a",
            payload = PhraseObservedPayload(
                phraseId = "phrase_invalid",
                inputType = InputType.TEXT
            ),
            createdAt = 1_700_000_000L
        )
        val invalid = packet.copy(payloadHash = "not_a_valid_payload_hash")
        val result = PacketValidator().validate(invalid)

        assertFalse(result.valid)
        assertTrue(result.errors.contains("Invalid payload_hash"))
        assertTrue(result.errors.contains("Invalid packet_id"))
    }

    @Test
    fun devSignatureMismatchIsRejected() {
        val packet = factory.create(
            packetType = PacketType.PHRASE_OBSERVED,
            zone = "test_zone",
            author = "author_a",
            payload = PhraseObservedPayload(
                phraseId = "phrase_signature",
                inputType = InputType.TEXT
            ),
            createdAt = 1_700_000_000L,
            signature = "dev_signature:author_a:wrong"
        )
        val result = PacketValidator().validate(packet)

        assertFalse(result.valid)
        assertEquals(PacketSignatureStatus.DEV_SIGNATURE_MISMATCH, result.signatureStatus)
        assertTrue(result.errors.contains("Invalid dev signature"))
    }
}

