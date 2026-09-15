package org.daovibe.android.ui

import android.content.ContentResolver
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.daovibe.android.core.mycelium.LEDGER_IMPORT_MAX_BYTES
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import java.io.ByteArrayOutputStream

private const val LEDGER_IMPORT_READ_BUFFER_BYTES = 8 * 1024

@Composable
internal fun SettingsScreen(
    repository: LocalMyceliumRepository
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var statusMessage by remember {
        mutableStateOf(
            "Export or import the local packet ledger. Device identity stays on this device."
        )
    }

    var isWorking by remember { mutableStateOf(false) }

    val exportLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        if (uri == null) {
            statusMessage = "Export cancelled."
            return@rememberLauncherForActivityResult
        }

        scope.launch {
            isWorking = true

            runCatching {
                val json = repository.exportLedgerJson()

                withContext(Dispatchers.IO) {
                    context.contentResolver
                        .openOutputStream(uri, "wt")
                        ?.bufferedWriter()
                        ?.use { writer ->
                            writer.write(json)
                        }
                        ?: error("Could not open destination file.")
                }
            }.onSuccess {
                statusMessage = "Ledger exported successfully."
            }.onFailure { error ->
                statusMessage = "Export failed: ${error.message ?: "Unknown error"}"
            }

            isWorking = false
        }
    }

    val importLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri == null) {
            statusMessage = "Import cancelled."
            return@rememberLauncherForActivityResult
        }

        scope.launch {
            isWorking = true

            runCatching {
                val json = withContext(Dispatchers.IO) {
                    context.contentResolver.readLedgerJsonWithinLimit(uri)
                }

                repository.importLedgerJson(json)
            }.onSuccess { result ->
                statusMessage =
                    "Import complete: ${result.insertedPackets} imported, " +
                        "${result.duplicatePackets} duplicates, " +
                        "${result.totalPackets} total."
            }.onFailure { error ->
                statusMessage =
                    "Import rejected: ${error.message ?: "Unknown error"}"
            }

            isWorking = false
        }
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        StatusChipRow {
            StatusChip(
                "Local",
                accentColor = DaoVibeColors.Cyan
            )
            StatusChip(
                "Ledger tools",
                accentColor = DaoVibeColors.Violet
            )
        }

        InfoSurface {
            Text(
                text = "Ledger backup",
                style = MaterialTheme.typography.titleMedium
            )

            Text(
                text =
                    "Create a local JSON copy of the packet ledger used to reconstruct " +
                        "Mycelium state.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )

            Button(
                modifier = Modifier.fillMaxWidth(),
                enabled = !isWorking,
                onClick = {
                    exportLauncher.launch("daovibe-ledger.json")
                }
            ) {
                Text(
                    if (isWorking) {
                        "Working..."
                    } else {
                        "Export Ledger"
                    }
                )
            }
        }

        InfoSurface {
            Text(
                text = "Restore or transfer ledger",
                style = MaterialTheme.typography.titleMedium
            )

            Text(
                text =
                    "Import a DAOVibe ledger JSON file. Every packet is decoded " +
                        "and validated before anything is written. If any packet " +
                        "is invalid or expired, the import is rejected.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )

            Button(
                modifier = Modifier.fillMaxWidth(),
                enabled = !isWorking,
                onClick = {
                    importLauncher.launch(
                        arrayOf(
                            "application/json",
                            "text/plain"
                        )
                    )
                }
            ) {
                Text("Import Ledger")
            }
        }

        InfoSurface {
            Text(
                text = "Local identity",
                style = MaterialTheme.typography.titleMedium
            )

            Text(
                text =
                    "Device Node ID is NOT replaced by ledger import. Imported packets " +
                        "retain their original authors.\n\nThis distinction is important " +
                        "because two DAOVibe devices should remain separate nodes while " +
                        "possessing the same packet history.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
        }

        Text(
            text = statusMessage,
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.Cyan
        )
    }
}

private fun ContentResolver.readLedgerJsonWithinLimit(uri: Uri): String {
    openInputStream(uri)?.use { input ->
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(LEDGER_IMPORT_READ_BUFFER_BYTES)
        var totalBytes = 0

        while (true) {
            val read = input.read(buffer)
            if (read == -1) break

            totalBytes += read
            require(totalBytes <= LEDGER_IMPORT_MAX_BYTES) {
                "Ledger file is too large. Maximum local import is ${LEDGER_IMPORT_MAX_BYTES / 1024} KiB."
            }
            output.write(buffer, 0, read)
        }

        return output.toString(Charsets.UTF_8.name())
    }

    error("Could not read selected file.")
}
