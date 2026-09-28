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
import org.daovibe.android.core.mycelium.CorrectionState
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
    var activeCorrectionMeaningId by remember { mutableStateOf<String?>(null) }

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
                correctionEnabled = activeCorrectionMeaningId == null,
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
                },
                onProposeCorrection = { reference, context ->
                    scope.launch {
                        activeCorrectionMeaningId = meaning.meaningId
                        runCatching {
                            repository.proposeCorrection(phrase.phraseId, meaning.meaningId, reference, context)
                        }.onSuccess { result ->
                            message = voteResultMessage(result)
                        }.onFailure {
                            message = "That correction could not be added on this device."
                        }
                        activeCorrectionMeaningId = null
                    }
                },
                onVoteCorrection = { correction, vote ->
                    scope.launch {
                        activeCorrectionMeaningId = meaning.meaningId
                        runCatching {
                            repository.voteCorrection(phrase.phraseId, meaning.meaningId, correction.correctionId, vote)
                        }.onSuccess { result -> message = voteResultMessage(result) }
                            .onFailure { message = "That correction judgement could not be added on this device." }
                        activeCorrectionMeaningId = null
                    }
                },
                onProposeTombstone = { correction, reason, confidence ->
                    scope.launch {
                        activeCorrectionMeaningId = meaning.meaningId
                        runCatching {
                            repository.proposeCorrectionTombstone(
                                phrase.phraseId, meaning.meaningId, correction.correctionId, reason, confidence
                            )
                        }.onSuccess { result -> message = voteResultMessage(result) }
                            .onFailure { message = "That tombstone proposal could not be added on this device." }
                        activeCorrectionMeaningId = null
                    }
                },
                onVoteTombstone = { tombstone, vote ->
                    scope.launch {
                        activeCorrectionMeaningId = meaning.meaningId
                        runCatching {
                            repository.voteCorrectionTombstone(
                                phrase.phraseId, meaning.meaningId,
                                tombstone.correctionId, tombstone.tombstoneId, vote
                            )
                        }.onSuccess { result -> message = voteResultMessage(result) }
                            .onFailure { message = "That tombstone judgement could not be added on this device." }
                        activeCorrectionMeaningId = null
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
    correctionEnabled: Boolean,
    onVote: (VoteValue) -> Unit,
    onProposeCorrection: (String, String?) -> Unit,
    onVoteCorrection: (CorrectionState, VoteValue) -> Unit,
    onProposeTombstone: (CorrectionState, String, Double) -> Unit,
    onVoteTombstone: (org.daovibe.android.core.mycelium.CorrectionTombstoneState, VoteValue) -> Unit
) {
    var correctionInput by remember(meaning.meaningId) { mutableStateOf("") }
    var correctionContext by remember(meaning.meaningId) { mutableStateOf("") }
    var tombstoneReason by remember(meaning.meaningId) { mutableStateOf("") }
    var tombstoneConfidence by remember(meaning.meaningId) { mutableStateOf("0.25") }
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
                text = "Original: ${meaning.referenceMeaning}",
                style = MaterialTheme.typography.titleMedium
            )
            Text("Effective: ${meaning.effectiveReferenceMeaning}${if (meaning.effectiveCorrectionId != null) " (corrected)" else ""}", style = MaterialTheme.typography.titleMedium, color = DaoVibeColors.Cyan)
            Text("Effective context: ${meaning.effectiveContext ?: "(none)"}", style = MaterialTheme.typography.bodyMedium, color = DaoVibeColors.TextSecondary)
            Text(
                text = "Original context: ${meaning.context ?: "(none)"}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = DaoVibeColors.TextSecondary
            )
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
            OutlinedTextField(value = correctionInput, onValueChange = { correctionInput = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Corrected reference meaning") }, enabled = correctionEnabled, minLines = 1, maxLines = 3)
            OutlinedTextField(value = correctionContext, onValueChange = { correctionContext = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Correction context (optional)") }, enabled = correctionEnabled, minLines = 1, maxLines = 3)
            Button(onClick = { onProposeCorrection(correctionInput, correctionContext.trim().takeIf { it.isNotEmpty() }); correctionInput = ""; correctionContext = "" }, enabled = correctionEnabled && correctionInput.trim().isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text("Propose correction") }
            if (meaning.corrections.isNotEmpty()) {
                Text("Correction candidates", style = MaterialTheme.typography.titleSmall)
                meaning.corrections.forEach { correction ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(correction.referenceMeaning, style = MaterialTheme.typography.bodyLarge)
                        Text("Context: ${correction.context ?: "(none)"} · confidence ${formatPercent(correction.confidence)} · ${formatCount(correction.confirms)} confirms · ${formatCount(correction.rejects)} rejects · score ${"%.2f".format(correction.score)}${if (correction.correctionId == meaning.effectiveCorrectionId) " · EFFECTIVE" else ""}${if (correction.tombstoned) " · TOMBSTONED" else " · ACTIVE"}", style = MaterialTheme.typography.labelMedium, color = DaoVibeColors.TextSecondary)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            JudgementButton("Confirm", correctionEnabled, Modifier.weight(1f)) { onVoteCorrection(correction, VoteValue.CONFIRM) }
                            JudgementButton("Reject", correctionEnabled, Modifier.weight(1f)) { onVoteCorrection(correction, VoteValue.REJECT) }
                        }
                        OutlinedTextField(
                            value = tombstoneReason,
                            onValueChange = { tombstoneReason = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Tombstone reason") },
                            enabled = correctionEnabled,
                            minLines = 1,
                            maxLines = 3
                        )
                        OutlinedTextField(
                            value = tombstoneConfidence,
                            onValueChange = { tombstoneConfidence = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Tombstone confidence (0–1)") },
                            enabled = correctionEnabled,
                            singleLine = true
                        )
                        val parsedTombstoneConfidence = tombstoneConfidence.toDoubleOrNull()
                        Button(
                            onClick = {
                                onProposeTombstone(correction, tombstoneReason, parsedTombstoneConfidence ?: 0.25)
                                tombstoneReason = ""
                            },
                            enabled = correctionEnabled && tombstoneReason.trim().isNotEmpty() &&
                                parsedTombstoneConfidence?.isFinite() == true && parsedTombstoneConfidence in 0.0..1.0,
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Propose tombstone") }
                        correction.tombstones.forEach { tombstone ->
                            Text(
                                "Tombstone ${tombstone.tombstoneId}: ${tombstone.reason} · ${formatCount(tombstone.confirms)} confirms · ${formatCount(tombstone.rejects)} rejects · score ${"%.2f".format(tombstone.score)}${if (tombstone.effective) " · EFFECTIVE TOMBSTONE" else ""}",
                                style = MaterialTheme.typography.labelMedium,
                                color = DaoVibeColors.TextSecondary
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                JudgementButton("Confirm", correctionEnabled, Modifier.weight(1f)) {
                                    onVoteTombstone(tombstone, VoteValue.CONFIRM)
                                }
                                JudgementButton("Reject", correctionEnabled, Modifier.weight(1f)) {
                                    onVoteTombstone(tombstone, VoteValue.REJECT)
                                }
                            }
                        }
                    }
                }
            }
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
