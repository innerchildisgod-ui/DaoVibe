package org.daovibe.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.daovibe.android.core.mycelium.LocalMyceliumSnapshot

@Composable
internal fun HomeScreen(
    snapshot: LocalMyceliumSnapshot,
    onNavigate: (DaoVibeDestination) -> Unit
) {
    val phraseCount = snapshot.state.phrases.size
    val meaningCount = snapshot.state.phrases.sumOf { it.meanings.size }
    val recentPacketCount = snapshot.recentPackets.size
    val identity = snapshot.identity

    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = "DAOVibe",
                style = MaterialTheme.typography.displayMedium,
                color = DaoVibeColors.TextPrimary,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Local node ready",
                style = MaterialTheme.typography.titleMedium,
                color = DaoVibeColors.Cyan
            )
            Text(
                text = "A resident, packet-ledger core for people-owned computation.",
                style = MaterialTheme.typography.bodyMedium,
                color = DaoVibeColors.TextSecondary
            )
            StatusChipRow {
                StatusChip("On-device state", accentColor = DaoVibeColors.Green)
                StatusChip("Ledger source of truth", accentColor = DaoVibeColors.Cyan)
                StatusChip("Node ${shortNodeId(identity?.nodeId)}", accentColor = DaoVibeColors.Violet)
            }
        }

        Spacer(modifier = Modifier.height(2.dp))
        SectionTitle("Core")

        DashboardCard(
            title = "MYCELIUM",
            subtitle = "Language & shared meaning",
            metric = "$phraseCount phrases, $meaningCount meanings",
            status = "Active",
            accentColor = DaoVibeColors.Cyan,
            onClick = { onNavigate(DaoVibeDestination.Mycelium) }
        )

        DashboardCard(
            title = "PACKET LEDGER",
            subtitle = "Local source of truth",
            metric = "Recent packets: $recentPacketCount",
            status = "Local",
            accentColor = DaoVibeColors.Blue,
            onClick = { onNavigate(DaoVibeDestination.Ledger) }
        )

        DashboardCard(
            title = "DEVICE",
            subtitle = "Your local DAOVibe node",
            metric = "Node ${shortNodeId(identity?.nodeId)}",
            status = "Private",
            accentColor = DaoVibeColors.Violet,
            onClick = { onNavigate(DaoVibeDestination.Device) }
        )

        DashboardCard(
            title = "NETWORK",
            subtitle = "Internet peer connection",
            metric = "Handshake foundation only",
            status = "Offline",
            accentColor = DaoVibeColors.Green,
            onClick = { onNavigate(DaoVibeDestination.Network) }
        )

        DashboardCard(
            title = "SETTINGS",
            subtitle = "Local app controls",
            metric = "Placeholder controls",
            status = "Ready",
            accentColor = DaoVibeColors.Cyan,
            onClick = { onNavigate(DaoVibeDestination.Settings) }
        )

        SectionTitle("Future")

        DashboardCard(
            title = "EEE",
            subtitle = "Execution environment layer",
            metric = "Future - Not active yet",
            status = "Future",
            accentColor = DaoVibeColors.Amber,
            enabled = false
        )

        DashboardCard(
            title = "SBP",
            subtitle = "Shared build protocol layer",
            metric = "Future - Not active yet",
            status = "Future",
            accentColor = DaoVibeColors.Violet,
            enabled = false
        )
    }
}
