package org.daovibe.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import org.daovibe.android.core.connection.ConnectionRepository
import org.daovibe.android.core.connection.ConnectionSession
import org.daovibe.android.core.connection.ConnectionSessionState
import org.daovibe.android.core.connection.PeerEndpoint
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
    connectionRepository: ConnectionRepository
) {
    val pairedDevices by connectionRepository.observeActivePairings()
        .collectAsState(initial = emptyList())
    val sessions by connectionRepository.sessions.collectAsState()
    val scope = rememberCoroutineScope()
    var attemptingPairingId by remember { mutableStateOf<String?>(null) }
    var syncingPairingId by remember { mutableStateOf<String?>(null) }
    var syncMessageByPairingId by remember {
        mutableStateOf<Map<String, String>>(emptyMap())
    }
    var connectionMessage by remember {
        mutableStateOf(
            "Direct TCP only works when the remote host is reachable and its " +
                "firewall/NAT allows the connection."
        )
    }
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
                                connectionRepository.syncWithPairedNode(
                                    remoteNodeId = pairedDevice.remoteNodeId,
                                    endpoint = endpoint
                                )
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

