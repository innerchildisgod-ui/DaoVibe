package org.daovibe.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.mycelium.LocalMyceliumSnapshot
import org.daovibe.android.core.mycelium.MyceliumState
import org.daovibe.android.core.protocol.VoteValue
import java.util.Locale

@Composable
fun DaoVibeApp(repository: LocalMyceliumRepository) {
    val snapshot by repository.observeSnapshot().collectAsState(
        initial = LocalMyceliumSnapshot(
            identity = null,
            state = MyceliumState(emptyList()),
            recentPackets = emptyList()
        )
    )
    val scope = rememberCoroutineScope()
    var phraseInput by remember { mutableStateOf("") }
    var meaningInput by remember { mutableStateOf("") }
    var displayNameInput by remember { mutableStateOf("") }
    var selectedPhraseId by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf("Local core ready.") }

    LaunchedEffect(Unit) {
        repository.ensureDeviceIdentity()
    }

    LaunchedEffect(snapshot.identity?.displayName) {
        displayNameInput = snapshot.identity?.displayName.orEmpty()
    }

    LaunchedEffect(snapshot.state.phrases) {
        if (selectedPhraseId == null || snapshot.state.findPhrase(selectedPhraseId.orEmpty()) == null) {
            selectedPhraseId = snapshot.state.phrases.firstOrNull()?.phraseId
        }
    }

    val selectedPhrase = selectedPhraseId?.let { snapshot.state.findPhrase(it) }
    val bestMeaning = selectedPhrase?.let { snapshot.state.bestMeaning(it.phraseId) }

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("DAOVibe", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                Text("A People-Owned Computational Civilization")

                Section(title = "My Device") {
                    Text("Display name")
                    Row(modifier = Modifier.fillMaxWidth()) {
                        OutlinedTextField(
                            value = displayNameInput,
                            onValueChange = { displayNameInput = it },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                scope.launch {
                                    runCatching {
                                        repository.identityRepository.updateDisplayName(displayNameInput)
                                    }.onSuccess {
                                        message = "Display name saved."
                                    }.onFailure {
                                        message = it.message ?: "Could not save display name."
                                    }
                                }
                            }
                        ) {
                            Text("Save")
                        }
                    }
                    Text("Node ID: ${snapshot.identity?.nodeId ?: "creating..."}")
                    Text("Local status: on-device only")
                }

                Section(title = "Mycelium") {
                    OutlinedTextField(
                        value = phraseInput,
                        onValueChange = { phraseInput = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Enter phrase") },
                        singleLine = true
                    )
                    Button(
                        onClick = {
                            scope.launch {
                                runCatching {
                                    repository.observePhrase(phraseInput)
                                }.onSuccess {
                                    phraseInput = ""
                                    message = "Phrase observation stored: ${it.decision.name.lowercase(Locale.US)}"
                                }.onFailure {
                                    message = it.message ?: "Could not observe phrase."
                                }
                            }
                        }
                    ) {
                        Text("Observe Phrase")
                    }

                    if (snapshot.state.phrases.isNotEmpty()) {
                        Text("Phrases", fontWeight = FontWeight.SemiBold)
                        snapshot.state.phrases.forEach { phrase ->
                            OutlinedButton(
                                onClick = { selectedPhraseId = phrase.phraseId },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(phrase.surfaceText ?: phrase.phraseId)
                            }
                        }
                    }

                    if (selectedPhrase != null) {
                        Text("Selected: ${selectedPhrase.surfaceText ?: selectedPhrase.phraseId}")
                        OutlinedTextField(
                            value = meaningInput,
                            onValueChange = { meaningInput = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Propose meaning") },
                            singleLine = true
                        )
                        Button(
                            onClick = {
                                scope.launch {
                                    runCatching {
                                        repository.proposeMeaning(selectedPhrase.phraseId, meaningInput)
                                    }.onSuccess {
                                        meaningInput = ""
                                        message = "Meaning proposal stored: ${it.decision.name.lowercase(Locale.US)}"
                                    }.onFailure {
                                        message = it.message ?: "Could not propose meaning."
                                    }
                                }
                            }
                        ) {
                            Text("Propose Meaning")
                        }

                        selectedPhrase.meanings.forEach { meaning ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(meaning.referenceMeaning, fontWeight = FontWeight.SemiBold)
                                    Text("Confidence ${meaning.confidence.scoreText()} | Score ${meaning.score.scoreText()}")
                                    Row {
                                        VoteButton("Confirm") {
                                            scope.launch {
                                                val result = repository.voteMeaning(
                                                    selectedPhrase.phraseId,
                                                    meaning.meaningId,
                                                    VoteValue.CONFIRM
                                                )
                                                message = "Vote stored: ${result.decision.name.lowercase(Locale.US)}"
                                            }
                                        }
                                        VoteButton("Reject") {
                                            scope.launch {
                                                val result = repository.voteMeaning(
                                                    selectedPhrase.phraseId,
                                                    meaning.meaningId,
                                                    VoteValue.REJECT
                                                )
                                                message = "Vote stored: ${result.decision.name.lowercase(Locale.US)}"
                                            }
                                        }
                                        VoteButton("Unsure") {
                                            scope.launch {
                                                val result = repository.voteMeaning(
                                                    selectedPhrase.phraseId,
                                                    meaning.meaningId,
                                                    VoteValue.UNSURE
                                                )
                                                message = "Vote stored: ${result.decision.name.lowercase(Locale.US)}"
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Text("Current best meaning: ${bestMeaning?.referenceMeaning ?: "none yet"}")
                        if (bestMeaning != null) {
                            Text("Confidence ${bestMeaning.confidence.scoreText()} | Score ${bestMeaning.score.scoreText()} | Votes ${bestMeaning.totalVotes.scoreText()}")
                        }
                    }
                }

                Section(title = "Ledger") {
                    Text(message)
                    if (snapshot.recentPackets.isEmpty()) {
                        Text("No local packets yet.")
                    } else {
                        snapshot.recentPackets.forEach { packet ->
                            Text("${packet.packetType} | ${packet.packetId.take(12)} | ${packet.createdAt}")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Section(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun VoteButton(
    label: String,
    onClick: () -> Unit
) {
    TextButton(onClick = onClick) {
        Text(label)
    }
}

private fun Double.scoreText(): String =
    "%.3f".format(Locale.US, this)
