package org.daovibe.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import org.daovibe.android.core.mycelium.MyceliumStateDiagnostic
import org.daovibe.android.core.mycelium.MyceliumConsistencyReport
import org.daovibe.android.core.mycelium.MyceliumAlphaReadinessReport
import org.daovibe.android.core.mycelium.MyceliumConsistencyChecker
import org.daovibe.android.core.mycelium.safeReadinessWarnings
import org.daovibe.android.core.connection.ConnectionRepository
import org.daovibe.android.core.connection.KnownPeer
import org.daovibe.android.core.connection.PeerRegistryRepository
import org.daovibe.android.core.connection.PeerSyncCoordinator
import org.daovibe.android.core.connection.ConnectionSession
import org.daovibe.android.core.connection.ConnectionSessionState
import org.daovibe.android.core.connection.PeerEndpoint
import org.daovibe.android.core.connection.PeerInvite
import org.daovibe.android.core.connection.PeerInviteCodec
import org.daovibe.android.core.connection.health
import org.daovibe.android.core.connection.PeerHealth
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.mycelium.LocalMyceliumSnapshot
import org.daovibe.android.core.pairing.PairingJsonCodec
import org.daovibe.android.core.pairing.PairingOffer
import org.daovibe.android.core.pairing.PairingRecord
import org.daovibe.android.core.pairing.PairingRepository
import org.daovibe.android.core.sync.SyncRunResult

@Composable
internal fun DeviceScreen(
    snapshot: LocalMyceliumSnapshot,
    repository: LocalMyceliumRepository,
    pairingRepository: PairingRepository
) {
    val identity = snapshot.identity
    val pairedDevices by pairingRepository.observeActivePairings()
        .collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var fingerprint by remember(snapshot.ledgerPackets) { mutableStateOf("Calculating...") }
    var consistencyReport by remember { mutableStateOf<MyceliumConsistencyReport?>(null) }
    var readinessReport by remember { mutableStateOf<MyceliumAlphaReadinessReport?>(null) }
    var readinessWorking by remember { mutableStateOf(false) }
    LaunchedEffect(snapshot.ledgerPackets) {
        fingerprint = try {
            MyceliumStateDiagnostic.snapshot(context, snapshot.ledgerPackets).fingerprint()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            "Unavailable: replay_failed"
        }
    }
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    var displayNameInput by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("This device identity is stored locally.") }
    var identityError by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }
    var pairingOffer by remember { mutableStateOf<PairingOffer?>(null) }
    var pairingMessage by remember {
        mutableStateOf("No pairing offer created yet.")
    }
    var isCreatingPairingOffer by remember { mutableStateOf(false) }
    var pairingApprovalJson by remember { mutableStateOf("") }
    var isImportingPairingApproval by remember { mutableStateOf(false) }
    val status = when {
        identity != null -> "Ready"
        identityError != null -> "Error"
        else -> "Missing"
    }

    LaunchedEffect(identity?.displayName) {
        displayNameInput = identity?.displayName.orEmpty()
    }

    LaunchedEffect(identity) {
        if (identity == null) {
            runCatching {
                repository.ensureDeviceIdentity()
            }.onSuccess {
                identityError = null
            }.onFailure {
                identityError = it.message ?: "Could not create local identity."
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        StatusChipRow {
            StatusChip("Local / offline", accentColor = DaoVibeColors.Green)
            StatusChip(status, accentColor = identityStatusAccent(status))
            StatusChip("No secrets shown", accentColor = DaoVibeColors.Violet)
        }

        InfoSurface {
            Text(
                text = "This device",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = identity?.displayName ?: "Creating local identity...",
                style = MaterialTheme.typography.titleLarge
            )
            DetailLine("Node", shortNodeId(identity?.nodeId))
            DetailLine("Platform", "Android")
            DetailLine("Device model", localDeviceModel())
            DetailLine("Status", status)
            identityError?.let { error ->
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodyMedium,
                    color = DaoVibeColors.Amber
                )
            }
            Text(
                text = "This is the identity of this DAOVibe device.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
        }

        InfoSurface {
            Text(
                text = "Node ID",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = identity?.nodeId ?: "Creating...",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.Cyan
            )
            Text(
                text = "Created ${identity?.createdAt ?: "..."}",
                style = MaterialTheme.typography.labelMedium,
                color = DaoVibeColors.TextMuted
            )
            OutlinedButton(
                onClick = {
                    identity?.nodeId?.let { nodeId ->
                        clipboard?.setPrimaryClip(
                            ClipData.newPlainText("DAOVibe Node ID", nodeId)
                        )
                        message = "Node ID copied."
                    }
                },
                enabled = identity?.nodeId?.isNotBlank() == true,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Copy Node ID")
            }
        }

        InfoSurface {
            Text(
                text = "Mycelium state fingerprint",
                style = MaterialTheme.typography.titleMedium
            )
            SelectionContainer {
                Text(fingerprint, fontFamily = FontFamily.Monospace)
            }
        }

        InfoSurface {
            Text(
                text = "Mycelium alpha readiness",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = "Runs a read-only ledger, replay, and export/import consistency check. " +
                    "No automatic repair is performed.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
            readinessReport?.let { report ->
                StatusChip(
                    text = report.status,
                    accentColor = when (report.status) {
                        "ready_for_local_alpha" -> DaoVibeColors.Green
                        "warning" -> DaoVibeColors.Amber
                        else -> DaoVibeColors.Amber
                    }
                )
                DetailLine("Node ID", snapshot.identity?.nodeId ?: "missing")
                DetailLine("Packets", report.packetCount.toString())
                DetailLine("Peers", report.peerCount.toString())
                DetailLine("Checked", report.checkedAt.toString())
                SelectionContainer {
                    Text(
                        report.canonicalFingerprint ?: "unavailable",
                        fontFamily = FontFamily.Monospace,
                        color = DaoVibeColors.Cyan
                    )
                }
                Text(
                    "Consistency: ${report.ledgerConsistency.name.lowercase()} · " +
                        "Replay: ${report.replayConsistency.name.lowercase()}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = DaoVibeColors.TextSecondary
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = {
                        scope.launch {
                            readinessWorking = true
                            runCatching {
                                MyceliumConsistencyChecker.check(repository, context, System.currentTimeMillis() / 1000L)
                            }.onSuccess { (consistency, readiness) ->
                                consistencyReport = consistency
                                readinessReport = readiness
                            }.onFailure { error ->
                                readinessReport = MyceliumAlphaReadinessReport(
                                    appPackage = context.packageName,
                                    appVersionName = context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown",
                                    appVersionCode = context.packageManager.getPackageInfo(context.packageName, 0).let { info ->
                                        if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
                                    },
                                    roomSchemaVersion = org.daovibe.android.core.storage.DAO_VIBE_ROOM_SCHEMA_VERSION,
                                    status = "failed",
                                    nodeIdPresent = snapshot.identity?.nodeId?.isNotBlank() == true,
                                    databaseOpen = true,
                                    migrationChainOk = "current_schema_open",
                                    ledgerConsistency = org.daovibe.android.core.mycelium.MyceliumConsistencyStatus.FAILED,
                                    replayConsistency = org.daovibe.android.core.mycelium.MyceliumConsistencyStatus.FAILED,
                                    canonicalFingerprint = null,
                                    packetCount = snapshot.ledgerPackets.size,
                                    peerCount = 0,
                                    identityPersistent = if (snapshot.identity != null) {
                                        "identity_present_in_persistent_row"
                                    } else {
                                        "missing"
                                    },
                                    exportImportRoundtripTested = false,
                                    semanticFixtureCompatibility = "test_suite_verified",
                                    inviteFixtureCompatibility = "test_suite_verified",
                                    // Exception text is deliberately excluded from
                                    // copied readiness diagnostics: it may contain
                                    // paths, SQL, payload text, or other internals.
                                    warnings = safeReadinessWarnings(error),
                                    checkedAt = System.currentTimeMillis() / 1000L
                                )
                            }
                            readinessWorking = false
                        }
                    },
                    enabled = !readinessWorking,
                    modifier = Modifier.weight(1f)
                ) { Text(if (readinessWorking) "Checking..." else "Run check") }
                OutlinedButton(
                    onClick = {
                        val text = readinessReport?.diagnosticsText()
                            ?: consistencyReport?.diagnosticsText()
                            ?: "No readiness check has been run."
                        clipboard?.setPrimaryClip(ClipData.newPlainText("DAOVibe readiness diagnostics", text))
                    },
                    enabled = readinessReport != null || consistencyReport != null,
                    modifier = Modifier.weight(1f)
                ) { Text("Copy diagnostics") }
            }
        }

        InfoSurface {
            Text(
                text = "Display name",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = "A friendly local name for this device. Changing it does not change the Node ID.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
            OutlinedTextField(
                value = displayNameInput,
                onValueChange = { displayNameInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Device name") },
                placeholder = { Text("Balaji's Poco") },
                singleLine = true
            )
            Button(
                onClick = {
                    scope.launch {
                        isSaving = true
                        runCatching {
                            repository.identityRepository.updateDisplayName(displayNameInput)
                        }.onSuccess { updated ->
                            displayNameInput = updated.displayName
                            message = "Display name saved."
                        }.onFailure {
                            message = it.message ?: "Could not save display name."
                        }
                        isSaving = false
                    }
                },
                enabled = displayNameInput.trim().isNotEmpty() &&
                    !isSaving &&
                    identity != null,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isSaving) "Saving..." else "Save Display Name")
            }
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
        }

        InfoSurface {
            Text(
                text = "Paired devices",
                style = MaterialTheme.typography.titleMedium
            )
            if (pairedDevices.isEmpty()) {
                Text(
                    text = "No paired devices yet",
                    style = MaterialTheme.typography.bodyMedium,
                    color = DaoVibeColors.TextSecondary
                )
            } else {
                pairedDevices.forEach { pairedDevice ->
                    PairedDeviceRow(pairedDevice)
                }
            }
        }

        InfoSurface {
            Text(
                text = "Pair a computer",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text =
                    "Create a transport-neutral pairing offer for a future DAOVibe " +
                        "computer node. This milestone only prepares local protocol " +
                        "data; it does not transfer the offer or synchronize packets.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
            StatusChip(
                text = "Development preview",
                accentColor = DaoVibeColors.Violet
            )
            Button(
                onClick = {
                    scope.launch {
                        isCreatingPairingOffer = true
                        runCatching {
                            pairingRepository.createPairingOffer()
                        }.onSuccess { offer ->
                            pairingOffer = offer
                            pairingMessage = "Pairing offer ready to copy or inspect."
                        }.onFailure { error ->
                            pairingMessage =
                                error.message ?: "Could not create pairing offer."
                        }
                        isCreatingPairingOffer = false
                    }
                },
                enabled = identity != null && !isCreatingPairingOffer,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    if (isCreatingPairingOffer) {
                        "Creating..."
                    } else {
                        "Create Pairing Offer"
                    }
                )
            }
            pairingOffer?.let { offer ->
                SelectionContainer {
                    Text(
                        text = PairingJsonCodec.encode(offer),
                        modifier = Modifier.fillMaxWidth(),
                        style = MaterialTheme.typography.bodyMedium,
                        fontFamily = FontFamily.Monospace,
                        color = DaoVibeColors.Cyan
                    )
                }
                OutlinedButton(
                    onClick = {
                        clipboard?.setPrimaryClip(
                            ClipData.newPlainText(
                                "DAOVibe Pairing Offer",
                                PairingJsonCodec.encode(offer)
                            )
                        )
                        pairingMessage = if (clipboard == null) {
                            "Clipboard unavailable."
                        } else {
                            "Pairing offer copied."
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Copy Pairing Offer")
                }
            }
            Text(
                text =
                    "Paste the desktop PairingApproval JSON below after the desktop " +
                        "node processes this offer. This is development pairing " +
                        "correlation, not secure authentication.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
            OutlinedTextField(
                value = pairingApprovalJson,
                onValueChange = { pairingApprovalJson = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Desktop PairingApproval JSON") },
                minLines = 4,
                enabled = !isImportingPairingApproval
            )
            Button(
                onClick = {
                    scope.launch {
                        isImportingPairingApproval = true
                        runCatching {
                            pairingRepository.importPairingApprovalJson(
                                pairingApprovalJson
                            )
                        }.onSuccess { record ->
                            pairingMessage =
                                "Development pairing applied with " +
                                    "${record.remoteDisplayName}."
                        }.onFailure { error ->
                            pairingMessage =
                                "Approval rejected: " +
                                    (error.message ?: "Invalid approval.")
                        }
                        isImportingPairingApproval = false
                    }
                },
                enabled = pairingApprovalJson.trim().isNotEmpty() &&
                    !isImportingPairingApproval &&
                    identity != null,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    if (isImportingPairingApproval) {
                        "Applying..."
                    } else {
                        "Apply Desktop Approval"
                    }
                )
            }
            Text(
                text = pairingMessage,
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
        }
    }
}

@Composable
private fun PairedDeviceRow(pairing: PairingRecord) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = pairing.remoteDisplayName,
            style = MaterialTheme.typography.titleMedium,
            color = DaoVibeColors.TextPrimary
        )
        DetailLine("Node", shortNodeId(pairing.remoteNodeId))
        DetailLine("Platform", pairing.remotePlatform)
        DetailLine("Role", pairing.remoteRole)
        DetailLine("Status", pairing.status.wireValue)
        pairing.pairedAt?.let { pairedAt ->
            DetailLine("Paired", pairedAt.toString())
        }
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextPrimary
        )
    }
}

internal fun localDeviceModel(
    manufacturer: String = Build.MANUFACTURER,
    model: String = Build.MODEL
): String {
    val cleanManufacturer = manufacturer.trim()
    val cleanModel = model.trim()

    return when {
        cleanManufacturer.isEmpty() && cleanModel.isEmpty() -> "Android device"
        cleanManufacturer.isEmpty() -> cleanModel
        cleanModel.isEmpty() -> cleanManufacturer
        cleanModel.startsWith(cleanManufacturer, ignoreCase = true) -> cleanModel
        else -> "$cleanManufacturer $cleanModel"
    }
}

private fun identityStatusAccent(status: String) =
    when (status) {
        "Ready" -> DaoVibeColors.Green
        "Missing" -> DaoVibeColors.Amber
        else -> DaoVibeColors.Violet
    }

@Composable
internal fun NetworkScreen(
    connectionRepository: ConnectionRepository,
    peerRegistryRepository: PeerRegistryRepository,
    peerSyncCoordinator: PeerSyncCoordinator
) {
    val pairedDevices by connectionRepository.observeActivePairings()
        .collectAsState(initial = emptyList())
    val sessions by connectionRepository.sessions.collectAsState()
    val knownPeers by peerRegistryRepository.observePeers().collectAsState(initial = emptyList())
    var localNodeId by remember { mutableStateOf("unknown") }
    val scope = rememberCoroutineScope()
    var peerNodeId by remember { mutableStateOf("") }
    var peerHost by remember { mutableStateOf("") }
    var peerPort by remember { mutableStateOf("") }
    var peerPairingId by remember { mutableStateOf("") }
    var attemptingPairingId by remember { mutableStateOf<String?>(null) }
    var syncingPairingId by remember { mutableStateOf<String?>(null) }
    var syncMessageByPairingId by remember {
        mutableStateOf<Map<String, String>>(emptyMap())
    }
    var diagnoseMessageByPeer by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var connectionMessage by remember {
        mutableStateOf(
            "Direct TCP only works when the remote host is reachable and its " +
                "firewall/NAT allows the connection."
        )
    }
    val context = LocalContext.current
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    LaunchedEffect(Unit) {
        localNodeId = runCatching { peerRegistryRepository.localIdentity().nodeId }.getOrDefault("unknown")
    }
    var inviteHost by remember { mutableStateOf("") }
    var invitePort by remember { mutableStateOf("") }
    var invitePairingId by remember { mutableStateOf("") }
    var invitePayload by remember { mutableStateOf("") }
    var invitePreview by remember { mutableStateOf<PeerInvite?>(null) }
    var inviteMessage by remember { mutableStateOf("Development correlation only; not secure authentication.") }
    val liveSession = sessions.lastOrNull {
        it.state !in setOf(
            ConnectionSessionState.REJECTED,
            ConnectionSessionState.DISCONNECTED,
            ConnectionSessionState.FAILED
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        StatusChipRow {
            StatusChip("Internet peer connection", accentColor = DaoVibeColors.Cyan)
            StatusChip(
                networkStatusLabel(liveSession),
                accentColor = networkStatusAccent(liveSession)
            )
            StatusChip(
                if (syncingPairingId == null) {
                    "Manual sync only"
                } else {
                    "Processing bounded sync window"
                },
                accentColor = DaoVibeColors.Cyan
            )
        }

        InfoSurface {
            Text(
                text = "Internet peer connection",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text =
                    "Connect to a manually configured host and port. This " +
                        "development transport performs an explicit handshake " +
                        "and bounded packet-ledger delta sync only when you ask.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
            StatusChip(
                text = "TCP / manual bounded sync",
                accentColor = DaoVibeColors.Amber
            )
        }

        SectionTitle("Paired nodes available for connection")
        InfoSurface {
            Text("Known peers / sync", style = MaterialTheme.typography.titleMedium)
            Text("Connection metadata is local only; packet history remains in the ledger.", color = DaoVibeColors.TextSecondary)
            OutlinedTextField(peerNodeId, { peerNodeId = it }, label = { Text("Peer node ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(peerHost, { peerHost = it }, label = { Text("Host") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(peerPort, { peerPort = it }, label = { Text("Port") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(peerPairingId, { peerPairingId = it }, label = { Text("Pairing ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            Button(onClick = {
                scope.launch {
                    runCatching {
                        peerRegistryRepository.addOrUpdate(peerNodeId, peerHost, peerPort.toIntOrNull() ?: -1, peerPairingId)
                    }.onSuccess { peerNodeId = ""; peerHost = ""; peerPort = ""; peerPairingId = "" }
                }
            }, enabled = peerNodeId.isNotBlank() && peerHost.isNotBlank() && peerPairingId.isNotBlank()) { Text("Add / update peer") }
            if (knownPeers.isEmpty()) EmptyState("No manually configured peers.")
            knownPeers.forEach { entity ->
                val peer = KnownPeer(entity.remoteNodeId, entity.displayName, entity.host, entity.port, entity.pairingId, entity.lastSuccessfulContactAt, entity.lastError, entity.lastFailureAt, entity.lastOutcome, entity.lastStage, entity.lastErrorCategory, entity.lastAttempts, entity.lastImportedPackets, entity.lastDuplicatePackets, entity.lastExportedPackets, entity.lastSyncStartedAt, entity.lastSyncFinishedAt, entity.lastCursor)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(peer.displayName ?: peer.remoteNodeId)
                        Text("${peer.remoteNodeId} · ${peer.host}:${peer.port}", color = DaoVibeColors.TextSecondary)
                        Text("Health: ${entity.health(System.currentTimeMillis() / 1000L).name.lowercase()}", color = DaoVibeColors.Cyan)
                        entity.lastSuccessfulContactAt?.let { Text("Last success: $it", color = DaoVibeColors.TextSecondary) }
                        entity.lastFailureAt?.let { Text("Last failure: $it", color = DaoVibeColors.Amber) }
                        entity.lastStage?.let { stage ->
                            Text("Last result: ${entity.lastOutcome ?: "unknown"} at $stage" + (entity.lastErrorCategory?.let { "/$it" } ?: ""), color = DaoVibeColors.TextSecondary)
                        }
                        entity.lastDiagnosticStage?.let { stage ->
                            Text("Diagnose: ${entity.lastDiagnosticOutcome ?: "unknown"} at $stage" + (entity.lastDiagnosticErrorCategory?.let { "/$it" } ?: ""), color = DaoVibeColors.Cyan)
                        }
                        peer.lastError?.let { Text("Last error: $it", color = DaoVibeColors.Amber) }
                    }
                    Button(onClick = {
                        scope.launch {
                            val attempt = peerSyncCoordinator.syncOne(peer.remoteNodeId)
                            syncMessageByPairingId = syncMessageByPairingId + (peer.remoteNodeId to (attempt.structuredResult?.let(::peerSyncResultMessage) ?: (attempt.error ?: "Sync unavailable")))
                        }
                    }) { Text("Sync") }
                    OutlinedButton(onClick = {
                        scope.launch {
                            val result = peerSyncCoordinator.diagnoseOne(peer.remoteNodeId)
                            diagnoseMessageByPeer = diagnoseMessageByPeer + (peer.remoteNodeId to if (result.outcome == org.daovibe.android.core.connection.PeerDiagnoseOutcome.SUCCESS) "Diagnose: healthy in ${result.latencyMs ?: 0} ms" else "Diagnose failed at ${result.stage.name.lowercase()}: ${result.errorCategory?.name?.lowercase() ?: "unknown"}")
                        }
                    }) { Text("Diagnose") }
                    OutlinedButton(onClick = {
                        clipboard?.setPrimaryClip(ClipData.newPlainText("DAOVibe peer diagnostics", peerDiagnosticsText(entity, localNodeId)))
                    }) { Text("Copy diagnostics") }
                    if (entity.lastOutcome == "failed") {
                        OutlinedButton(onClick = {
                            scope.launch {
                                val attempt = peerSyncCoordinator.syncOne(peer.remoteNodeId)
                                syncMessageByPairingId = syncMessageByPairingId + (peer.remoteNodeId to (attempt.structuredResult?.let(::peerSyncResultMessage) ?: (attempt.error ?: "Retry unavailable")))
                            }
                        }) { Text("Retry") }
                    }
                    Button(onClick = { scope.launch { peerRegistryRepository.remove(peer.remoteNodeId) } }) { Text("Remove") }
                }
                syncMessageByPairingId[peer.remoteNodeId]?.let { Text(it, color = DaoVibeColors.TextSecondary) }
                diagnoseMessageByPeer[peer.remoteNodeId]?.let { Text(it, color = DaoVibeColors.Cyan) }
            }
            Button(onClick = { scope.launch { peerSyncCoordinator.syncAll() } }, enabled = knownPeers.isNotEmpty()) { Text("Sync all known peers") }
        }
        InfoSurface {
            Text("Peer invite", style = MaterialTheme.typography.titleMedium)
            Text(
                "Create or paste a compact invite for an already approved development relationship. " +
                    "Invites are correlation data, not authentication.",
                color = DaoVibeColors.TextSecondary
            )
            OutlinedTextField(inviteHost, { inviteHost = it }, label = { Text("Invite host") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(invitePort, { invitePort = it }, label = { Text("Invite port") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(invitePairingId, { invitePairingId = it }, label = { Text("Approved pairing ID") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            Button(onClick = {
                scope.launch {
                    runCatching {
                        require(pairedDevices.any { it.pairingId == invitePairingId.trim() && it.status.wireValue == "approved" }) {
                            "invite pairing ID must refer to an approved local relationship"
                        }
                        val identity = peerRegistryRepository.localIdentity()
                        val now = System.currentTimeMillis() / 1000L
                        PeerInvite(
                            sourceNodeId = identity.nodeId,
                            sourceDisplayName = identity.displayName,
                            host = inviteHost,
                            port = invitePort.toIntOrNull() ?: -1,
                            pairingId = invitePairingId,
                            createdAt = now,
                            expiresAt = now + 86_400L
                        ).also { PeerInviteCodec.validate(it, now) }
                    }.onSuccess { invite ->
                        invitePreview = invite
                        invitePayload = PeerInviteCodec.encodePayload(invite)
                        inviteMessage = "Invite ready. Share the payload or canonical JSON."
                    }.onFailure { inviteMessage = it.message ?: "Invite could not be created." }
                }
            }, enabled = inviteHost.isNotBlank() && invitePairingId.isNotBlank()) { Text("Create invite") }
            invitePreview?.let { invite ->
                Text("Invite ID: ${invite.inviteId()}", fontFamily = FontFamily.Monospace, color = DaoVibeColors.Cyan)
                Text("${invite.sourceNodeId} · ${invite.host}:${invite.port} · expires ${invite.expiresAt}", color = DaoVibeColors.TextSecondary)
                SelectionContainer { Text(invite.canonicalJson(), fontFamily = FontFamily.Monospace, color = DaoVibeColors.TextSecondary) }
                SelectionContainer { Text(invitePayload, fontFamily = FontFamily.Monospace, color = DaoVibeColors.Cyan) }
                OutlinedButton(onClick = {
                    clipboard?.setPrimaryClip(ClipData.newPlainText("DAOVibe Peer Invite", invitePayload))
                    inviteMessage = if (clipboard == null) "Clipboard unavailable." else "Invite copied."
                }) { Text("Copy invite payload") }
                OutlinedButton(onClick = {
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, invitePayload)
                    }
                    context.startActivity(Intent.createChooser(shareIntent, "Share peer invite"))
                    inviteMessage = "Share sheet opened."
                }) { Text("Share invite") }
            }
            OutlinedTextField(invitePayload, { invitePayload = it }, label = { Text("Paste invite payload or canonical JSON") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
            Button(onClick = {
                runCatching {
                    val now = System.currentTimeMillis() / 1000L
                    if (invitePayload.trimStart().startsWith("{")) PeerInviteCodec.decodeCanonical(invitePayload.trim(), now)
                    else PeerInviteCodec.decodePayload(invitePayload.trim(), now)
                }.onSuccess { invite ->
                    invitePreview = invite
                    inviteMessage = "Preview parsed. Confirm Add / update to save local peer metadata."
                }.onFailure { inviteMessage = it.message ?: "Invite rejected." }
            }, enabled = invitePayload.isNotBlank()) { Text("Preview invite") }
            invitePreview?.let { invite ->
                Button(onClick = {
                    scope.launch {
                        runCatching { peerRegistryRepository.importInvite(invite) }
                            .onSuccess { inviteMessage = "Peer metadata added/updated; no connection started." }
                            .onFailure { inviteMessage = it.message ?: "Invite import rejected." }
                    }
                }) { Text("Add / update peer from invite") }
            }
            Text(inviteMessage, color = DaoVibeColors.TextSecondary)
        }
        if (pairedDevices.isEmpty()) {
            EmptyState("No active paired nodes yet.")
        } else {
            pairedDevices.forEach { pairedDevice ->
                NetworkPairedDeviceRow(
                    pairing = pairedDevice,
                    session = sessions.firstOrNull {
                        it.pairingId == pairedDevice.pairingId
                    },
                    isBusy = attemptingPairingId != null ||
                        syncingPairingId != null,
                    isConnecting =
                        attemptingPairingId == pairedDevice.pairingId,
                    isSyncing = syncingPairingId == pairedDevice.pairingId,
                    syncMessage = syncMessageByPairingId[pairedDevice.pairingId],
                    onConnect = { endpoint ->
                        scope.launch {
                            attemptingPairingId = pairedDevice.pairingId
                            runCatching {
                                connectionRepository.connectToPairedNode(
                                    remoteNodeId = pairedDevice.remoteNodeId,
                                    endpoint = endpoint
                                )
                            }.onSuccess { result ->
                                connectionMessage = when (result) {
                                    is org.daovibe.android.core.connection.ConnectionHandshakeResult.Accepted ->
                                        "Peer handshake verified. The socket closed after the response; no packet sync ran."
                                    is org.daovibe.android.core.connection.ConnectionHandshakeResult.Rejected ->
                                        "Remote node rejected the connection: ${result.message.reasonCode.wireValue}."
                                    is org.daovibe.android.core.connection.ConnectionHandshakeResult.Failed ->
                                        result.failure.message
                                }
                            }.onFailure { error ->
                                connectionMessage =
                                    error.message ?: "Connection attempt failed."
                            }
                            attemptingPairingId = null
                        }
                    },
                    onSync = { endpoint ->
                        scope.launch {
                            syncingPairingId = pairedDevice.pairingId
                            runCatching {
                                peerSyncCoordinator.syncDirect(
                                    remoteNodeId = pairedDevice.remoteNodeId,
                                    endpoint = endpoint
                                ).result ?: error("Sync failed")
                            }.onSuccess { result ->
                                syncMessageByPairingId =
                                    syncMessageByPairingId + (
                                        pairedDevice.pairingId to
                                            syncResultMessage(result)
                                        )
                            }.onFailure { error ->
                                syncMessageByPairingId =
                                    syncMessageByPairingId + (
                                        pairedDevice.pairingId to
                                            "Sync failed: " +
                                                (error.message
                                                    ?: "unknown error")
                                        )
                            }
                            syncingPairingId = null
                        }
                    }
                )
            }
        }

        InfoSurface {
            Text(
                text = "Protocol boundary",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text =
                    "A compatible session requires an active local pairing, " +
                        "matching Node IDs, matching session ID, compatible " +
                        "protocol versions, and well-formed capabilities. " +
                        "Pairing is local correlation, not cryptographic authentication. " +
                        "This development transport is not encrypted.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
        }

        Text(
            text = connectionMessage,
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
    }
}

@Composable
private fun NetworkPairedDeviceRow(
    pairing: PairingRecord,
    session: ConnectionSession?,
    isBusy: Boolean,
    isConnecting: Boolean,
    isSyncing: Boolean,
    syncMessage: String?,
    onConnect: (PeerEndpoint) -> Unit,
    onSync: (PeerEndpoint) -> Unit
) {
    var hostInput by remember(pairing.pairingId) { mutableStateOf("") }
    var portInput by remember(pairing.pairingId) { mutableStateOf("") }
    val parsedPort = portInput.trim().toIntOrNull()
    val endpoint = parsedPort?.let { port ->
        PeerEndpoint(host = hostInput, port = port)
    }
    val canConnect = endpoint?.isValid() == true && !isBusy

    InfoSurface {
        Text(
            text = pairing.remoteDisplayName,
            style = MaterialTheme.typography.titleMedium,
            color = DaoVibeColors.TextPrimary
        )
        DetailLine("Node", shortNodeId(pairing.remoteNodeId))
        DetailLine("Platform", pairing.remotePlatform)
        DetailLine("Role", pairing.remoteRole)
        DetailLine("Pairing", pairing.status.wireValue)
        DetailLine("Session", sessionStatusLabel(session))
        session?.transportFailure?.let { failure ->
            Text(
                text = failure.message,
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.Amber
            )
        }
        session?.rejectReason?.let { reason ->
            Text(
                text = "Reason: ${reason.wireValue}",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
        }
        OutlinedTextField(
            value = hostInput,
            onValueChange = { hostInput = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Host") },
            placeholder = { Text("192.0.2.10 or example.net") },
            singleLine = true,
            enabled = !isBusy
        )
        OutlinedTextField(
            value = portInput,
            onValueChange = { portInput = it.filter(Char::isDigit) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Port") },
            placeholder = { Text("4242") },
            singleLine = true,
            enabled = !isBusy
        )
        OutlinedButton(
            onClick = {
                endpoint?.let(onConnect)
            },
            enabled = canConnect,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (isConnecting) "Connecting..." else "Connect")
        }
        OutlinedButton(
            onClick = {
                endpoint?.let(onSync)
            },
            enabled = endpoint?.isValid() == true && !isBusy,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (isSyncing) "Syncing packets..." else "Sync now")
        }
        syncMessage?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
        }
        Text(
            text =
                "Reachability is manual. This direct endpoint does not provide " +
                    "NAT traversal, relay, or encryption.",
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
    }
}

private fun networkStatusLabel(session: ConnectionSession?): String =
    when (session?.state) {
        null -> "Local / offline"
        ConnectionSessionState.CONNECTED -> "Handshake complete"
        else -> session.state.wireValue
    }

private fun sessionStatusLabel(session: ConnectionSession?): String =
    when (session?.state) {
        null -> "Idle"
        ConnectionSessionState.HELLO_SENT -> "Hello sent"
        ConnectionSessionState.HELLO_RECEIVED -> "Hello received"
        ConnectionSessionState.NEGOTIATING -> "Negotiating"
        ConnectionSessionState.CONNECTING -> "Connecting"
        ConnectionSessionState.CONNECTED -> "Handshake complete"
        ConnectionSessionState.REJECTED -> "Rejected"
        ConnectionSessionState.DISCONNECTED -> "Disconnected"
        ConnectionSessionState.FAILED -> "Failed"
        ConnectionSessionState.IDLE -> "Idle"
    }

private fun syncResultMessage(result: SyncRunResult): String =
    when (result) {
        is SyncRunResult.Completed -> {
            if (result.importedPackets == 0) {
                "Sync complete: already synchronized. " +
                    "${result.windowsProcessed} window(s); " +
                    "cursor ${result.latestCursor}."
            } else {
                "Sync complete: ${result.importedPackets} new packets imported; " +
                    "${result.duplicatePackets} duplicate(s); " +
                    "${result.windowsProcessed} window(s); cursor " +
                    "${result.latestCursor}."
            }
        }

        is SyncRunResult.Rejected ->
            "Sync rejected: ${result.reasonCode}."

        is SyncRunResult.Failed ->
            "Sync failed: ${result.failure.message}"
    }

private fun networkStatusAccent(session: ConnectionSession?) =
    when (session?.state) {
        ConnectionSessionState.CONNECTED -> DaoVibeColors.Green
        null -> DaoVibeColors.Green
        else -> DaoVibeColors.Amber
    }

private fun peerSyncResultMessage(result: org.daovibe.android.core.connection.PeerSyncResult): String =
    if (result.outcome == org.daovibe.android.core.connection.PeerSyncOutcome.SUCCESS) {
        "Success: ${result.importedPackets} imported, ${result.duplicatePackets} duplicate(s), attempts=${result.attempts}, cursor=${result.cursor ?: "n/a"}"
    } else {
        "Failed at ${result.stage.name.lowercase()}: ${result.errorCategory?.name?.lowercase() ?: "unknown"} — ${result.message ?: "no detail"}"
    }

internal fun peerDiagnosticsText(peer: org.daovibe.android.core.storage.KnownPeerEntity, localNodeId: String): String = buildString {
    appendLine("local diagnostics only")
    appendLine("local_node_id=$localNodeId")
    appendLine("remote_node_id=${peer.remoteNodeId}")
    appendLine("endpoint=${peer.host}:${peer.port}")
    appendLine("health=${peer.health(System.currentTimeMillis() / 1000L).name.lowercase()}")
    appendLine("last_successful_contact_at=${peer.lastSuccessfulContactAt ?: "none"}")
    appendLine("last_failure_at=${peer.lastFailureAt ?: "none"}")
    appendLine("last_stage=${peer.lastStage ?: "none"}")
    appendLine("last_error_category=${peer.lastErrorCategory ?: "none"}")
    appendLine("last_outcome=${peer.lastOutcome ?: "none"}")
    appendLine("attempts=${peer.lastAttempts ?: "none"}")
    appendLine("imported_packets=${peer.lastImportedPackets ?: "none"}")
    appendLine("duplicate_packets=${peer.lastDuplicatePackets ?: "none"}")
    appendLine("exported_packets=${peer.lastExportedPackets ?: "none"}")
    appendLine("cursor=${peer.lastCursor ?: "none"}")
    appendLine("diagnose_outcome=${peer.lastDiagnosticOutcome ?: "none"}")
    appendLine("diagnose_stage=${peer.lastDiagnosticStage ?: "none"}")
    appendLine("diagnose_error_category=${peer.lastDiagnosticErrorCategory ?: "none"}")
    appendLine("diagnose_at=${peer.lastDiagnosticAt ?: "none"}")
    appendLine("diagnose_latency_ms=${peer.lastDiagnosticLatencyMs ?: "none"}")
}

