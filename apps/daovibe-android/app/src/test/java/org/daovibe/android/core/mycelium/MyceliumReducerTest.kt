package org.daovibe.android.core.mycelium

import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.MeaningProposalPayload
import org.daovibe.android.core.protocol.MeaningVotePayload
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PhraseObservedPayload
import org.daovibe.android.core.protocol.SafetyLabel
import org.daovibe.android.core.protocol.SafetyLabelPayload
import org.daovibe.android.core.protocol.VoteValue
import org.daovibe.android.core.protocol.LmpPacket
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MyceliumReducerTest {
    private val factory = PacketFactory { 1_700_000_000L }

    @Test
    fun phraseObservedReplayIsDeterministic() {
        val packets = listOf(observePhrase())
        val state = MyceliumReducer.reduce(packets)

        assertEquals(1, state.phrases.size)
        assertEquals("phrase_001", state.phrases.first().phraseId)
        assertEquals("Vanakkam", state.phrases.first().surfaceText)
    }

    @Test
    fun meaningProposalReplayIsDeterministic() {
        val packets = listOf(
            observePhrase(),
            proposeMeaning()
        )
        val state = MyceliumReducer.reduce(packets)
        val phrase = state.findPhrase("phrase_001")

        assertNotNull(phrase)
        assertEquals(1, phrase!!.meanings.size)
        assertEquals("hello", phrase.meanings.first().referenceMeaning)
        assertEquals(0.25, phrase.meanings.first().confidence, 0.0)
    }

    @Test
    fun meaningVoteReplayIsDeterministic() {
        val packets = listOf(
            observePhrase(),
            proposeMeaning(),
            vote(author = "voter_a", vote = VoteValue.CONFIRM, createdAt = 1_700_000_002L)
        )
        val best = MyceliumReducer.reduce(packets).bestMeaning("phrase_001")

        assertNotNull(best)
        assertEquals(1.0, best!!.confirms, 0.0)
        assertEquals(0.0, best.rejects, 0.0)
        assertTrue(best.score > 0.25)
        assertTrue(best.score < 0.75)
    }

    @Test
    fun latestUniqueVoterBehaviorIsDeterministic() {
        val packets = listOf(
            observePhrase(),
            proposeMeaning(),
            vote(author = "same_voter", vote = VoteValue.CONFIRM, createdAt = 1_700_000_002L),
            vote(author = "same_voter", vote = VoteValue.REJECT, createdAt = 1_700_000_003L),
            vote(author = "other_voter", vote = VoteValue.CONFIRM, createdAt = 1_700_000_004L),
            vote(author = "unsure_voter", vote = VoteValue.UNSURE, createdAt = 1_700_000_005L)
        )
        val best = MyceliumReducer.reduce(packets).bestMeaning("phrase_001")

        assertNotNull(best)
        assertEquals(1.0, best!!.confirms, 0.0)
        assertEquals(1.0, best.rejects, 0.0)
        assertEquals(2.0, best.totalVotes, 0.0)
    }

    @Test
    fun safetyLabelReplayIsDeterministic() {
        val packets = listOf(
            observePhrase(),
            safetyLabel()
        )
        val phrase = MyceliumReducer.reduce(packets).findPhrase("phrase_001")

        assertEquals("mild_slang", phrase?.safetyLabel)
    }

    @Test
    fun twoReducersProduceSameStateForSameOrderedPackets() {
        val packets = listOf(
            observePhrase(),
            proposeMeaning(),
            vote(author = "voter_a", vote = VoteValue.CONFIRM, createdAt = 1_700_000_002L),
            vote(author = "voter_b", vote = VoteValue.CONFIRM, createdAt = 1_700_000_003L),
            safetyLabel()
        )

        assertEquals(
            MyceliumReducer.reduce(packets),
            MyceliumReducer.reduce(packets)
        )
    }

    private fun observePhrase(): LmpPacket<PacketPayload> =
        factory.create(
            packetType = PacketType.PHRASE_OBSERVED,
            zone = "test_zone",
            author = "author_a",
            payload = PhraseObservedPayload(
                phraseId = "phrase_001",
                surfaceText = "Vanakkam",
                languageHint = "ta",
                inputType = InputType.TEXT
            ),
            createdAt = 1_700_000_000L
        )

    private fun proposeMeaning(): LmpPacket<PacketPayload> =
        factory.create(
            packetType = PacketType.MEANING_PROPOSAL,
            zone = "test_zone",
            author = "author_a",
            payload = MeaningProposalPayload(
                phraseId = "phrase_001",
                meaningId = "meaning_001",
                referenceMeaning = "hello",
                confidence = 0.25
            ),
            createdAt = 1_700_000_001L
        )

    private fun vote(
        author: String,
        vote: VoteValue,
        createdAt: Long
    ): LmpPacket<PacketPayload> =
        factory.create(
            packetType = PacketType.MEANING_VOTE,
            zone = "test_zone",
            author = author,
            payload = MeaningVotePayload(
                phraseId = "phrase_001",
                meaningId = "meaning_001",
                vote = vote,
                confidence = 1.0
            ),
            createdAt = createdAt
        )

    private fun safetyLabel(): LmpPacket<PacketPayload> =
        factory.create(
            packetType = PacketType.SAFETY_LABEL,
            zone = "test_zone",
            author = "author_a",
            payload = SafetyLabelPayload(
                phraseId = "phrase_001",
                label = SafetyLabel.MILD_SLANG,
                reason = "local review"
            ),
            createdAt = 1_700_000_006L
        )
}

