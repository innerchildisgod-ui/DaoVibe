package org.daovibe.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.daovibe.android.core.mycelium.LocalMyceliumSnapshot
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PacketValidator
import org.daovibe.android.core.storage.PacketEntity
import org.json.JSONObject

@Composable
internal fun LedgerScreen(snapshot: LocalMyceliumSnapshot) {
    val ledgerPackets = snapshot.ledgerPackets
    var selectedPacketId by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedFilter by rememberSaveable { mutableStateOf(LedgerPacketFilter.All) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    val selectedPacket = selectedPacketId?.let { packetId ->
        ledgerPackets.firstOrNull { it.packetId == packetId }
    }

    LaunchedEffect(selectedPacketId, selectedPacket) {
        if (selectedPacketId != null && selectedPacket == null) {
            selectedPacketId = null
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (selectedPacket == null) {
            LedgerOverview(
                packets = ledgerPackets,
                selectedFilter = selectedFilter,
                searchQuery = searchQuery,
                onFilterSelected = { selectedFilter = it },
                onSearchChanged = { searchQuery = it },
                onPacketSelected = { selectedPacketId = it.packetId }
            )
        } else {
            PacketDetail(
                packet = selectedPacket,
                onBack = { selectedPacketId = null }
            )
        }
    }
}

@Composable
private fun LedgerOverview(
    packets: List<PacketEntity>,
    selectedFilter: LedgerPacketFilter,
    searchQuery: String,
    onFilterSelected: (LedgerPacketFilter) -> Unit,
    onSearchChanged: (String) -> Unit,
    onPacketSelected: (PacketEntity) -> Unit
) {
    val typeCounts = remember(packets) { packetTypeCounts(packets) }
    val visiblePackets = remember(packets, selectedFilter, searchQuery) {
        packets.filter { packet ->
            selectedFilter.matches(packet) && packetMatchesSearch(packet, searchQuery)
        }
    }

    StatusChipRow {
        StatusChip("Local / offline", accentColor = DaoVibeColors.Green)
        StatusChip("${packets.size} total packets", accentColor = DaoVibeColors.Cyan)
        StatusChip("Read-only", accentColor = DaoVibeColors.Violet)
    }

    InfoSurface {
        Text(
            text = "Local records",
            style = MaterialTheme.typography.titleMedium
        )
        Text(
            text = "These are the local records behind what DAOVibe knows.",
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
    }

    SectionTitle("Summary")
    PacketSummaryGrid(typeCounts)

    SectionTitle("Filters")
    LedgerFilterRow(
        selectedFilter = selectedFilter,
        onFilterSelected = onFilterSelected
    )

    OutlinedTextField(
        value = searchQuery,
        onValueChange = onSearchChanged,
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Search local ledger") },
        placeholder = { Text("Packet ID, type, author, phrase, meaning") },
        singleLine = true
    )

    SectionTitle("Packets")
    if (visiblePackets.isEmpty()) {
        EmptyState("No packets match this view.")
    } else {
        visiblePackets.forEach { packet ->
            PacketRow(
                packet = packet,
                onClick = { onPacketSelected(packet) }
            )
        }
    }
}

@Composable
private fun PacketSummaryGrid(typeCounts: Map<String, Int>) {
    InfoSurface {
        LedgerCountRow("Phrase observations", typeCounts.countFor(PacketType.PHRASE_OBSERVED))
        LedgerCountRow("Meaning proposals", typeCounts.countFor(PacketType.MEANING_PROPOSAL))
        LedgerCountRow("Votes", typeCounts.countFor(PacketType.MEANING_VOTE))
        LedgerCountRow("Safety labels", typeCounts.countFor(PacketType.SAFETY_LABEL))

        val knownTypes = LedgerPacketFilter.supportedPacketTypes
        val otherTypes = typeCounts
            .filterKeys { it !in knownTypes }
            .toSortedMap()
        if (otherTypes.isNotEmpty()) {
            otherTypes.forEach { (packetType, count) ->
                LedgerCountRow(humanizePacketType(packetType), count)
            }
        }
    }
}

@Composable
private fun LedgerCountRow(label: String, count: Int) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.labelLarge,
            color = DaoVibeColors.Cyan
        )
    }
}

@Composable
private fun LedgerFilterRow(
    selectedFilter: LedgerPacketFilter,
    onFilterSelected: (LedgerPacketFilter) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        LedgerPacketFilter.entries.forEach { filter ->
            FilterPill(
                label = filter.label,
                selected = selectedFilter == filter,
                onClick = { onFilterSelected(filter) }
            )
        }
    }
}

@Composable
private fun FilterPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    val accent = if (selected) DaoVibeColors.Cyan else DaoVibeColors.TextSecondary
    Surface(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = if (selected) DaoVibeColors.Cyan.copy(alpha = 0.12f) else Color.Transparent,
        contentColor = accent,
        border = BorderStroke(1.dp, if (selected) DaoVibeColors.Cyan else DaoVibeColors.BorderSoft)
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun PacketRow(
    packet: PacketEntity,
    onClick: () -> Unit
) {
    val inspection = remember(packet.packetJson) { inspectLedgerPacket(packet) }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        color = DaoVibeColors.Surface,
        contentColor = DaoVibeColors.TextPrimary,
        border = BorderStroke(1.dp, DaoVibeColors.BorderSoft)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = humanizePacketType(packet.packetType),
                        style = MaterialTheme.typography.titleMedium,
                        color = DaoVibeColors.Cyan
                    )
                    Text(
                        text = packetPreview(packet),
                        style = MaterialTheme.typography.bodyMedium,
                        color = DaoVibeColors.TextSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                StatusChip(
                    text = inspection.statusLabel,
                    accentColor = if (inspection.validationPassed == true) {
                        DaoVibeColors.Green
                    } else {
                        DaoVibeColors.Amber
                    }
                )
            }
            Text(
                text = "ID ${shortPacketId(packet.packetId)}",
                style = MaterialTheme.typography.labelMedium,
                color = DaoVibeColors.TextSecondary
            )
            Text(
                text = "Created ${packet.createdAt} | Author ${shortNodeId(packet.author)}",
                style = MaterialTheme.typography.labelMedium,
                color = DaoVibeColors.TextMuted
            )
        }
    }
}

@Composable
private fun PacketDetail(
    packet: PacketEntity,
    onBack: () -> Unit
) {
    val clipboard = LocalClipboardManager.current
    val inspection = remember(packet.packetJson) { inspectLedgerPacket(packet) }
    var showRawJson by rememberSaveable(packet.packetId) { mutableStateOf(false) }

    TextButton(onClick = onBack) {
        Text("Back to packet list")
    }

    InfoSurface {
        Text(
            text = humanizePacketType(packet.packetType),
            style = MaterialTheme.typography.titleMedium,
            color = DaoVibeColors.Cyan
        )
        Text(
            text = packetPreview(packet),
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
        StatusChipRow {
            StatusChip("Stored locally", accentColor = DaoVibeColors.Green)
            StatusChip(inspection.statusLabel, accentColor = validationAccent(inspection))
            StatusChip(expirationLabel(inspection), accentColor = expirationAccent(inspection))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(
                onClick = {
                    clipboard.setText(AnnotatedString(packet.packetId))
                }
            ) {
                Text("Copy packet ID")
            }
            TextButton(
                onClick = {
                    clipboard.setText(AnnotatedString(inspection.rawPacketJson))
                }
            ) {
                Text("Copy raw JSON")
            }
        }
    }

    SectionTitle("Packet fields")
    InfoSurface {
        DetailField("packet_id", packet.packetId)
        DetailField("packet_type", packet.packetType)
        DetailField("created_at", packet.createdAt.toString())
        packet.expiresAtText()?.let { DetailField("expires_at", it) }
        DetailField("zone", packet.zone)
        DetailField("author", packet.author)
        packet.parent?.let { DetailField("parent", it) }
        DetailField("payload_hash", packet.payloadHash)
        DetailField("signature", inspection.signature)
    }

    SectionTitle("Validation")
    InfoSurface {
        DetailField("stored", "Stored locally")
        DetailField("validation", inspection.validationSummary)
        DetailField("expired", expirationLabel(inspection))
        if (inspection.validationErrors.isNotEmpty()) {
            Text(
                text = inspection.validationErrors.joinToString(separator = "\n"),
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.Amber
            )
        }
    }

    SectionTitle("Payload")
    CodeBlock(inspection.payloadJson)

    Button(
        onClick = { showRawJson = !showRawJson },
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(if (showRawJson) "Hide Raw Packet JSON" else "Show Raw Packet JSON")
    }
    if (showRawJson) {
        CodeBlock(inspection.rawPacketJson)
    }
}

@Composable
private fun DetailField(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = DaoVibeColors.TextMuted
        )
        SelectionContainer {
            Text(
                text = value,
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextPrimary
            )
        }
    }
}

@Composable
private fun CodeBlock(text: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = DaoVibeColors.BackgroundRaised,
        contentColor = DaoVibeColors.TextPrimary,
        border = BorderStroke(1.dp, DaoVibeColors.BorderSoft)
    ) {
        SelectionContainer {
            Text(
                text = text,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DaoVibeColors.BackgroundRaised)
                    .padding(12.dp),
                style = MaterialTheme.typography.bodyMedium,
                fontFamily = FontFamily.Monospace,
                color = DaoVibeColors.TextSecondary
            )
        }
    }
}

internal enum class LedgerPacketFilter(
    val label: String,
    private val packetTypes: Set<String>? = null
) {
    All("All"),
    Phrase("Phrase", setOf(PacketType.PHRASE_OBSERVED.wireValue)),
    MeaningProposal("Meaning proposal", setOf(PacketType.MEANING_PROPOSAL.wireValue)),
    Votes("Votes", setOf(PacketType.MEANING_VOTE.wireValue)),
    Safety("Safety", setOf(PacketType.SAFETY_LABEL.wireValue));

    fun matches(packet: PacketEntity): Boolean =
        packetTypes == null || packet.packetType in packetTypes

    companion object {
        val supportedPacketTypes = PacketType.entries.map { it.wireValue }.toSet()
    }
}

internal data class LedgerPacketInspection(
    val validationPassed: Boolean?,
    val validationErrors: List<String>,
    val expired: Boolean?,
    val payloadJson: String,
    val rawPacketJson: String,
    val signature: String,
    val signatureStatus: String
) {
    val statusLabel: String
        get() = when (validationPassed) {
            true -> "Valid"
            false -> "Invalid"
            null -> "Unreadable"
        }

    val validationSummary: String
        get() = when (validationPassed) {
            true -> "Passes current packet validation ($signatureStatus)"
            false -> "Does not pass current packet validation ($signatureStatus)"
            null -> "Could not decode with the current packet codec"
        }
}

internal fun inspectLedgerPacket(
    packet: PacketEntity,
    nowSeconds: Long = System.currentTimeMillis() / 1000L,
    validator: PacketValidator = PacketValidator()
): LedgerPacketInspection {
    return try {
        val decoded = PacketJsonCodec.decode(packet.packetJson)
        val validation = validator.validate(decoded)
        LedgerPacketInspection(
            validationPassed = validation.valid,
            validationErrors = validation.errors,
            expired = validator.isExpired(decoded, nowSeconds),
            payloadJson = readableJson(PacketJsonCodec.encode(decoded).payloadObjectJson()),
            rawPacketJson = PacketJsonCodec.encode(decoded),
            signature = decoded.signature,
            signatureStatus = validation.signatureStatus.name.lowercase()
        )
    } catch (error: Exception) {
        val rawObject = runCatching { JSONObject(packet.packetJson) }.getOrNull()
        LedgerPacketInspection(
            validationPassed = null,
            validationErrors = listOf(error.message ?: "Packet could not be decoded"),
            expired = null,
            payloadJson = readableJson(packet.payloadJson),
            rawPacketJson = packet.packetJson,
            signature = rawObject?.stringOrNull("signature") ?: "unreadable",
            signatureStatus = "unreadable"
        )
    }
}

internal fun packetTypeCounts(packets: List<PacketEntity>): Map<String, Int> =
    packets.groupingBy { it.packetType }.eachCount()

internal fun packetMatchesSearch(packet: PacketEntity, query: String): Boolean {
    val normalizedQuery = query.trim().lowercase()
    if (normalizedQuery.isEmpty()) return true

    return listOfNotNull(
        packet.packetId,
        packet.packetType,
        packet.author,
        packet.zone,
        packet.phraseId,
        packet.meaningId,
        packetPreview(packet),
        packet.payloadJson
    ).any { value ->
        value.lowercase().contains(normalizedQuery)
    }
}

internal fun packetPreview(packet: PacketEntity): String {
    val payload = payloadJsonObject(packet.payloadJson)
    val typedPreview = when (packet.packetType) {
        PacketType.PHRASE_OBSERVED.wireValue ->
            payload?.stringOrNull("surface_text")
        PacketType.MEANING_PROPOSAL.wireValue ->
            payload?.stringOrNull("reference_meaning")
        PacketType.MEANING_VOTE.wireValue ->
            payload?.stringOrNull("vote")?.let { vote ->
                "Vote: ${humanizePacketType(vote)}"
            }
        PacketType.SAFETY_LABEL.wireValue ->
            payload?.stringOrNull("label")?.let { label ->
                "Safety: ${humanizeSafetyLabel(label)}"
            }
        else -> null
    }

    return typedPreview
        ?: payload?.stringOrNull("surface_text")
        ?: payload?.stringOrNull("reference_meaning")
        ?: packet.phraseId?.let { "Phrase ${shortPacketId(it)}" }
        ?: packet.meaningId?.let { "Meaning ${shortPacketId(it)}" }
        ?: "Packet stored locally"
}

internal fun humanizePacketType(value: String): String =
    value.split('_')
        .filter { it.isNotBlank() }
        .joinToString(" ") { word ->
            word.replaceFirstChar { character -> character.titlecase() }
        }

internal fun shortPacketId(packetId: String): String =
    when {
        packetId.length <= 18 -> packetId
        else -> "${packetId.take(12)}...${packetId.takeLast(6)}"
    }

private fun validationAccent(inspection: LedgerPacketInspection): Color =
    when (inspection.validationPassed) {
        true -> DaoVibeColors.Green
        false -> DaoVibeColors.Amber
        null -> DaoVibeColors.Violet
    }

private fun expirationLabel(inspection: LedgerPacketInspection): String =
    when (inspection.expired) {
        true -> "Expired"
        false -> "Not expired"
        null -> "Expiration unknown"
    }

private fun expirationAccent(inspection: LedgerPacketInspection): Color =
    if (inspection.expired == true) DaoVibeColors.Amber else DaoVibeColors.Cyan

private fun Map<String, Int>.countFor(packetType: PacketType): Int =
    this[packetType.wireValue] ?: 0

private fun PacketEntity.expiresAtText(): String? =
    runCatching {
        JSONObject(packetJson).let { json ->
            if (json.has("expires_at") && !json.isNull("expires_at")) {
                json.getLong("expires_at").toString()
            } else {
                null
            }
        }
    }.getOrNull()

private fun String.payloadObjectJson(): String =
    JSONObject(this).getJSONObject("payload").toString()

private fun readableJson(json: String): String =
    runCatching { JSONObject(json).toString(2) }.getOrElse { json }

private fun payloadJsonObject(payloadJson: String): JSONObject? =
    runCatching { JSONObject(payloadJson) }.getOrNull()

private fun JSONObject.stringOrNull(name: String): String? =
    if (has(name) && !isNull(name)) {
        optString(name).takeIf { it.isNotBlank() }
    } else {
        null
    }
