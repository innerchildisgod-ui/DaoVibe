package org.daovibe.android.core.mycelium

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

data class MeaningScoreResult(
    val score: Double,
    val confidence: Double,
    val confirms: Double,
    val rejects: Double,
    val totalVotes: Double
)

data class UniqueVoterVoteInput(
    val targetKey: String,
    val voterId: String?,
    val vote: String,
    val createdAt: Long,
    val packetId: String
)

data class UniqueVoterVoteCounts(
    val confirmVotes: Double,
    val rejectVotes: Double
)

fun calculateMeaningScore(
    confidence: Double?,
    confirms: Double?,
    rejects: Double?
): MeaningScoreResult {
    val normalizedConfidence = clampConfidence(confidence)
    val normalizedConfirms = normalizeVoteCount(confirms)
    val normalizedRejects = normalizeVoteCount(rejects)
    val totalVotes = normalizedConfirms + normalizedRejects
    val voteBalance = if (totalVotes > 0.0) {
        (normalizedConfirms - normalizedRejects) / totalVotes
    } else {
        0.0
    }
    val voteMaturity = min(totalVotes / MIN_VOTES_FOR_FULL_WEIGHT, 1.0)
    val voteSignal = voteBalance * voteMaturity * VOTE_WEIGHT

    return MeaningScoreResult(
        score = clampScore(normalizedConfidence + voteSignal),
        confidence = normalizedConfidence,
        confirms = normalizedConfirms,
        rejects = normalizedRejects,
        totalVotes = totalVotes
    )
}

fun countUniqueVoterVotes(votes: List<UniqueVoterVoteInput>): Map<String, UniqueVoterVoteCounts> {
    val countsByTarget = mutableMapOf<String, MutableVoteCounts>()
    val latestVoteByTargetVoter = mutableMapOf<String, UniqueVoterVoteInput>()

    for (vote in votes) {
        val targetKey = vote.targetKey.trim()
        if (targetKey.isEmpty()) continue

        val voterId = vote.voterId?.trim()?.takeIf { it.isNotEmpty() }
        if (voterId == null) {
            countsByTarget.getOrPut(targetKey) { MutableVoteCounts() }
                .add(vote.vote, ANONYMOUS_VOTE_WEIGHT)
            continue
        }

        val voteKey = StableVoteKey(targetKey, voterId).key
        val existingVote = latestVoteByTargetVoter[voteKey]
        if (existingVote == null || compareVotes(vote, existingVote) > 0) {
            latestVoteByTargetVoter[voteKey] = vote.copy(
                targetKey = targetKey,
                voterId = voterId
            )
        }
    }

    for (vote in latestVoteByTargetVoter.values) {
        countsByTarget.getOrPut(vote.targetKey) { MutableVoteCounts() }
            .add(vote.vote, IDENTIFIED_VOTE_WEIGHT)
    }

    return countsByTarget.mapValues { (_, counts) ->
        UniqueVoterVoteCounts(
            confirmVotes = counts.confirmVotes,
            rejectVotes = counts.rejectVotes
        )
    }
}

private data class StableVoteKey(val targetKey: String, val voterId: String) {
    val key: String = """["$targetKey","$voterId"]"""
}

private data class MutableVoteCounts(
    var confirmVotes: Double = 0.0,
    var rejectVotes: Double = 0.0
) {
    fun add(vote: String, weight: Double) {
        if (vote == "confirm") confirmVotes += weight
        if (vote == "reject") rejectVotes += weight
    }
}

private fun compareVotes(left: UniqueVoterVoteInput, right: UniqueVoterVoteInput): Int {
    if (left.createdAt != right.createdAt) {
        return left.createdAt.compareTo(right.createdAt)
    }

    return left.packetId.compareTo(right.packetId)
}

private fun clampConfidence(value: Double?): Double {
    val numericValue = value ?: DEFAULT_CONFIDENCE
    if (!numericValue.isFinite()) return DEFAULT_CONFIDENCE
    return max(MIN_CONFIDENCE, min(numericValue, MAX_CONFIDENCE))
}

private fun normalizeVoteCount(value: Double?): Double {
    val numericValue = value ?: 0.0
    if (!numericValue.isFinite() || numericValue <= 0.0) return 0.0
    if (numericValue < 1.0) return numericValue
    return floor(numericValue)
}

private fun clampScore(value: Double): Double =
    max(-1.0, min(value, 1.0))

private const val DEFAULT_CONFIDENCE = 0.0
private const val MIN_CONFIDENCE = 0.0
private const val MAX_CONFIDENCE = 1.0
private const val MIN_VOTES_FOR_FULL_WEIGHT = 3.0
private const val VOTE_WEIGHT = 0.5
private const val IDENTIFIED_VOTE_WEIGHT = 1.0
private const val ANONYMOUS_VOTE_WEIGHT = 0.5

