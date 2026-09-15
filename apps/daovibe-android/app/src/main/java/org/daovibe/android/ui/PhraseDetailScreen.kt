package org.daovibe.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.mycelium.MeaningState
import org.daovibe.android.core.mycelium.PhraseState
import org.daovibe.android.core.protocol.VoteValue

@Composable
internal fun PhraseDetailScreen(
    phrase: PhraseState,
    repository: LocalMyceliumRepository,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var meaningInput by remember { mutableStateOf("") }
    var message by remember {
        mutableStateOf("Add an interpretation, then let local judgement shape confidence.")
    }
    var isSubmittingMeaning by remember { mutableStateOf(false) }
    var activeVoteMeaningId by remember { mutableStateOf<String?>(null) }

    TextButton(onClick = onBack) {
        Text("Back to recent phrases")
    }

    InfoSurface {
        Text(
            text = "Phrase detail",
            style = MaterialTheme.typography.titleMedium
        )
        Text(
            text = phrase.surfaceText ?: phrase.phraseId,
            style = MaterialTheme.typography.headlineSmall,
            maxLines = 4,
            overflow = TextOverflow.Ellipsis
        )
        StatusChipRow {
            StatusChip("Local / offline", accentColor = DaoVibeColors.Green)
            StatusChip(
                "Safety: ${humanizeSafetyLabel(phrase.safetyLabel)}",
                accentColor = safetyAccent(phrase.safetyLabel)
            )
        }
    }

    InfoSurface {
        Text(
            text = "Propose a meaning",
            style = MaterialTheme.typography.titleMedium
        )
        Text(
            text = "What might this phrase mean in context?",
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
        OutlinedTextField(
            value = meaningInput,
            onValueChange = { meaningInput = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Possible meaning") },
            placeholder = { Text("An interpretation someone could confirm") },
            minLines = 2,
            maxLines = 4
        )
        Button(
            onClick = {
                scope.launch {
                    isSubmittingMeaning = true
                    runCatching {
                        repository.proposeMeaning(
                            phraseId = phrase.phraseId,
                            referenceMeaning = meaningInput
                        )
                    }.onSuccess { result ->
                        if (result.wasAcceptedOrAlreadyStored()) {
                            meaningInput = ""
                        }
                        message = meaningResultMessage(result)
                    }.onFailure {
                        message = "This meaning could not be added on this device."
                    }
                    isSubmittingMeaning = false
                }
            },
            enabled = meaningInput.trim().isNotEmpty() && !isSubmittingMeaning,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (isSubmittingMeaning) "Saving..." else "Propose Meaning")
        }
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
    }

    SectionTitle("Proposed meanings")
    if (phrase.meanings.isEmpty()) {
        EmptyState("No meanings proposed yet.")
    } else {
        phrase.meanings.forEach { meaning ->
            MeaningProposalCard(
                meaning = meaning,
                enabled = activeVoteMeaningId == null,
                onVote = { vote ->
                    scope.launch {
                        activeVoteMeaningId = meaning.meaningId
                        runCatching {
                            repository.voteMeaning(
                                phraseId = phrase.phraseId,
                                meaningId = meaning.meaningId,
                                vote = vote
                            )
                        }.onSuccess { result ->
                            message = voteResultMessage(result)
                        }.onFailure {
                            message = "That judgement could not be added on this device."
                        }
                        activeVoteMeaningId = null
                    }
                }
            )
        }
    }
}

@Composable
private fun MeaningProposalCard(
    meaning: MeaningState,
    enabled: Boolean,
    onVote: (VoteValue) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = DaoVibeColors.Surface,
        contentColor = DaoVibeColors.TextPrimary,
        border = BorderStroke(1.dp, DaoVibeColors.BorderSoft)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = meaning.referenceMeaning,
                style = MaterialTheme.typography.titleMedium
            )
            meaning.context?.takeIf { it.isNotBlank() }?.let { context ->
                Text(
                    text = context,
                    style = MaterialTheme.typography.bodyMedium,
                    color = DaoVibeColors.TextSecondary
                )
            }
            Text(
                text = "Confidence ${formatPercent(meaning.confidence)}",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.Cyan
            )
            Text(
                text = communityJudgementText(meaning),
                style = MaterialTheme.typography.labelMedium,
                color = DaoVibeColors.TextSecondary
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                JudgementButton(
                    label = "Confirm",
                    enabled = enabled,
                    modifier = Modifier.weight(1f),
                    onClick = { onVote(VoteValue.CONFIRM) }
                )
                JudgementButton(
                    label = "Reject",
                    enabled = enabled,
                    modifier = Modifier.weight(1f),
                    onClick = { onVote(VoteValue.REJECT) }
                )
                JudgementButton(
                    label = "Unsure",
                    enabled = enabled,
                    modifier = Modifier.weight(1f),
                    onClick = { onVote(VoteValue.UNSURE) }
                )
            }
        }
    }
}

@Composable
private fun JudgementButton(
    label: String,
    enabled: Boolean,
    modifier: Modifier,
    onClick: () -> Unit
) {
    OutlinedButton(
        modifier = modifier,
        enabled = enabled,
        onClick = onClick
    ) {
        Text(label)
    }
}

private fun communityJudgementText(meaning: MeaningState): String =
    if (meaning.totalVotes == 0.0) {
        "No community judgement yet"
    } else {
        "Community judgement: ${formatCount(meaning.confirms)} confirmed, " +
            "${formatCount(meaning.rejects)} rejected"
    }

private fun safetyAccent(label: String) =
    when (label) {
        "normal" -> DaoVibeColors.Green
        "mild_slang" -> DaoVibeColors.Amber
        else -> DaoVibeColors.Violet
    }
