package org.daovibe.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.daovibe.android.core.mycelium.BestMeaning
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.mycelium.LocalMyceliumSnapshot
import org.daovibe.android.core.mycelium.PacketReceiveDecision
import org.daovibe.android.core.mycelium.PacketReceiveResult
import org.daovibe.android.core.mycelium.PhraseState
import java.util.Locale

@Composable
internal fun MyceliumScreen(
    snapshot: LocalMyceliumSnapshot,
    repository: LocalMyceliumRepository
) {
    val scope = rememberCoroutineScope()
    var phraseInput by remember { mutableStateOf("") }
    var selectedPhraseId by rememberSaveable { mutableStateOf<String?>(null) }
    var message by remember {
        mutableStateOf("Observe a phrase to begin building shared meaning.")
    }
    var isObserving by remember { mutableStateOf(false) }
    val selectedPhrase = selectedPhraseId?.let(snapshot.state::findPhrase)

    LaunchedEffect(selectedPhraseId, selectedPhrase) {
        if (selectedPhraseId != null && selectedPhrase == null) {
            selectedPhraseId = null
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (selectedPhrase == null) {
            MyceliumOverview(
                snapshot = snapshot,
                phraseInput = phraseInput,
                isObserving = isObserving,
                message = message,
                onPhraseInputChanged = { phraseInput = it },
                onObservePhrase = {
                    scope.launch {
                        isObserving = true
                        runCatching {
                            repository.observePhrase(phraseInput)
                        }.onSuccess { result ->
                            if (result.wasAcceptedOrAlreadyStored()) {
                                phraseInput = ""
                            }
                            message = phraseResultMessage(result)
                        }.onFailure {
                            message = "This phrase could not be added on this device."
                        }
                        isObserving = false
                    }
                },
                onOpenPhrase = { selectedPhraseId = it }
            )
        } else {
            key(selectedPhrase.phraseId) {
                PhraseDetailScreen(
                    phrase = selectedPhrase,
                    repository = repository,
                    onBack = { selectedPhraseId = null }
                )
            }
        }
    }
}

@Composable
private fun MyceliumOverview(
    snapshot: LocalMyceliumSnapshot,
    phraseInput: String,
    isObserving: Boolean,
    message: String,
    onPhraseInputChanged: (String) -> Unit,
    onObservePhrase: () -> Unit,
    onOpenPhrase: (String) -> Unit
) {
    val meaningCount = snapshot.state.phrases.sumOf { it.meanings.size }

    StatusChipRow {
        StatusChip("Local / offline", accentColor = DaoVibeColors.Green)
        StatusChip("${snapshot.state.phrases.size} phrases", accentColor = DaoVibeColors.Cyan)
        StatusChip("$meaningCount meanings", accentColor = DaoVibeColors.Violet)
    }

    InfoSurface {
        Text(
            text = "Give a phrase meaning",
            style = MaterialTheme.typography.titleMedium
        )
        Text(
            text = "Start with language from your own life. Meaning stays on this device until packets are shared later.",
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
        OutlinedTextField(
            value = phraseInput,
            onValueChange = onPhraseInputChanged,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Phrase") },
            placeholder = { Text("What does 'break a leg' mean?") },
            singleLine = true
        )
        Button(
            onClick = onObservePhrase,
            enabled = phraseInput.trim().isNotEmpty() && !isObserving,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (isObserving) "Observing..." else "Observe Phrase")
        }
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
    }

    SectionTitle("Recent phrases")
    if (snapshot.state.phrases.isEmpty()) {
        EmptyState("No phrases observed on this device yet.")
    } else {
        snapshot.state.phrases.forEach { phrase ->
            PhraseSummaryCard(
                phrase = phrase,
                bestMeaning = snapshot.state.bestMeaning(phrase.phraseId),
                onClick = { onOpenPhrase(phrase.phraseId) }
            )
        }
    }
}

@Composable
private fun PhraseSummaryCard(
    phrase: PhraseState,
    bestMeaning: BestMeaning?,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        color = DaoVibeColors.Surface,
        contentColor = DaoVibeColors.TextPrimary,
        border = BorderStroke(1.dp, DaoVibeColors.BorderSoft)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Text(
                text = phrase.surfaceText ?: phrase.phraseId,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "${phrase.meanings.size} meaning proposals",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
            Text(
                text = phraseSummaryStatus(phrase, bestMeaning),
                style = MaterialTheme.typography.labelMedium,
                color = DaoVibeColors.Cyan
            )
            Text(
                text = "Safety: ${humanizeSafetyLabel(phrase.safetyLabel)}",
                style = MaterialTheme.typography.labelMedium,
                color = DaoVibeColors.TextMuted
            )
        }
    }
}

private fun phraseSummaryStatus(
    phrase: PhraseState,
    bestMeaning: BestMeaning?
): String {
    if (phrase.meanings.isEmpty()) return "Waiting for a meaning proposal"
    if (bestMeaning == null) return "Meaning proposals are being gathered"

    return "Confidence ${formatPercent(bestMeaning.confidence)} | " +
        "${formatCount(bestMeaning.totalVotes)} community votes"
}

internal fun phraseResultMessage(result: PacketReceiveResult): String =
    when (result.decision) {
        PacketReceiveDecision.ACCEPTED_NEW -> "Phrase observed locally."
        PacketReceiveDecision.ALREADY_STORED -> "That phrase is already known locally."
        PacketReceiveDecision.REJECTED_INVALID -> "The local ledger rejected that phrase."
        PacketReceiveDecision.REJECTED_EXPIRED -> "That phrase packet is no longer current."
        PacketReceiveDecision.FAILED_APPLY -> "The phrase could not update local meaning state."
    }

internal fun meaningResultMessage(result: PacketReceiveResult): String =
    when (result.decision) {
        PacketReceiveDecision.ACCEPTED_NEW -> "Meaning updated locally."
        PacketReceiveDecision.ALREADY_STORED -> "That meaning packet is already known locally."
        PacketReceiveDecision.REJECTED_INVALID -> "The local ledger rejected that meaning."
        PacketReceiveDecision.REJECTED_EXPIRED -> "That meaning packet is no longer current."
        PacketReceiveDecision.FAILED_APPLY -> "The meaning could not update local state."
    }

internal fun voteResultMessage(result: PacketReceiveResult): String =
    when (result.decision) {
        PacketReceiveDecision.ACCEPTED_NEW -> "Your judgement was added locally."
        PacketReceiveDecision.ALREADY_STORED -> "That judgement is already known locally."
        PacketReceiveDecision.REJECTED_INVALID -> "The local ledger rejected that judgement."
        PacketReceiveDecision.REJECTED_EXPIRED -> "That judgement packet is no longer current."
        PacketReceiveDecision.FAILED_APPLY -> "The judgement could not update local state."
    }

internal fun PacketReceiveResult.wasAcceptedOrAlreadyStored(): Boolean =
    decision == PacketReceiveDecision.ACCEPTED_NEW ||
        decision == PacketReceiveDecision.ALREADY_STORED

internal fun humanizeSafetyLabel(label: String): String =
    label.split('_')
        .filter { it.isNotBlank() }
        .joinToString(" ") { word ->
            word.replaceFirstChar { character ->
                character.titlecase(Locale.US)
            }
        }

internal fun formatPercent(value: Double): String =
    "${(value.coerceIn(0.0, 1.0) * 100.0).toInt()}%"

internal fun formatCount(value: Double): String =
    if (value % 1.0 == 0.0) value.toInt().toString() else "%.1f".format(Locale.US, value)
