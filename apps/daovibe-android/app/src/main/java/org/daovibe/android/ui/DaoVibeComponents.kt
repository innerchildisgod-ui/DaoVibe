package org.daovibe.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun DaoVibeScreenScaffold(
    currentDestination: DaoVibeDestination,
    onNavigate: (DaoVibeDestination) -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    Scaffold(
        containerColor = DaoVibeColors.Background,
        bottomBar = {
            DaoVibeNavigationBar(
                currentDestination = currentDestination,
                onNavigate = onNavigate
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(DaoVibeBackgroundBrush)
                .padding(padding)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                ScreenHeader(
                    title = currentDestination.screenTitle,
                    subtitle = currentDestination.screenSubtitle
                )
                content()
            }
        }
    }
}

private val DaoVibeBackgroundBrush = Brush.verticalGradient(
    colors = listOf(
        DaoVibeColors.Background,
        Color(0xFF071220),
        DaoVibeColors.Background
    )
)

@Composable
internal fun ScreenHeader(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            color = DaoVibeColors.TextPrimary
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = DaoVibeColors.TextSecondary
        )
    }
}

@Composable
internal fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        color = DaoVibeColors.TextPrimary,
        fontWeight = FontWeight.SemiBold
    )
}

@Composable
internal fun StatusChip(
    text: String,
    modifier: Modifier = Modifier,
    accentColor: Color = DaoVibeColors.Cyan
) {
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = accentColor.copy(alpha = 0.11f),
        contentColor = accentColor,
        border = BorderStroke(1.dp, accentColor.copy(alpha = 0.42f))
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
internal fun StatusChipRow(content: @Composable () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        content()
    }
}

@Composable
internal fun DashboardCard(
    title: String,
    subtitle: String,
    metric: String,
    status: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: (() -> Unit)? = null
) {
    val shape = RoundedCornerShape(22.dp)
    val clickableModifier = if (enabled && onClick != null) {
        Modifier.clickable(onClick = onClick)
    } else {
        Modifier
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .then(clickableModifier),
        shape = shape,
        color = DaoVibeColors.Surface,
        contentColor = DaoVibeColors.TextPrimary,
        border = BorderStroke(1.dp, accentColor.copy(alpha = if (enabled) 0.34f else 0.18f)),
        shadowElevation = if (enabled) 2.dp else 0.dp
    ) {
        Column(
            modifier = Modifier
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            accentColor.copy(alpha = if (enabled) 0.13f else 0.05f),
                            DaoVibeColors.Surface.copy(alpha = 0.0f)
                        )
                    )
                )
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
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
                        text = title,
                        style = MaterialTheme.typography.titleLarge,
                        color = if (enabled) DaoVibeColors.TextPrimary else DaoVibeColors.TextSecondary
                    )
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = DaoVibeColors.TextSecondary
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                StatusChip(
                    text = status,
                    accentColor = accentColor
                )
            }
            Text(
                text = metric,
                style = MaterialTheme.typography.labelLarge,
                color = accentColor
            )
        }
    }
}

@Composable
internal fun InfoSurface(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = DaoVibeColors.Surface,
        contentColor = DaoVibeColors.TextPrimary,
        border = BorderStroke(1.dp, DaoVibeColors.BorderSoft)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
    }
}

@Composable
internal fun EmptyState(text: String) {
    Text(
        text = text,
        modifier = Modifier.fillMaxWidth(),
        style = MaterialTheme.typography.bodyMedium,
        color = DaoVibeColors.TextMuted,
        textAlign = TextAlign.Center
    )
}

@Composable
private fun DaoVibeNavigationBar(
    currentDestination: DaoVibeDestination,
    onNavigate: (DaoVibeDestination) -> Unit
) {
    Surface(
        color = DaoVibeColors.BackgroundRaised,
        contentColor = DaoVibeColors.TextPrimary,
        shadowElevation = 8.dp,
        border = BorderStroke(1.dp, DaoVibeColors.BorderSoft)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 9.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            DaoVibeDestination.entries.forEach { destination ->
                DestinationNavItem(
                    destination = destination,
                    selected = currentDestination == destination,
                    onClick = { onNavigate(destination) }
                )
            }
        }
    }
}

@Composable
private fun DestinationNavItem(
    destination: DaoVibeDestination,
    selected: Boolean,
    onClick: () -> Unit
) {
    val accent = if (selected) DaoVibeColors.Cyan else DaoVibeColors.TextSecondary
    Surface(
        modifier = Modifier
            .widthIn(min = 84.dp)
            .height(54.dp)
            .clip(RoundedCornerShape(17.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(17.dp),
        color = if (selected) DaoVibeColors.Cyan.copy(alpha = 0.12f) else Color.Transparent,
        contentColor = accent,
        border = BorderStroke(
            width = 1.dp,
            color = if (selected) DaoVibeColors.Cyan.copy(alpha = 0.5f) else DaoVibeColors.BorderSoft
        )
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            DestinationGlyph(
                destination = destination,
                color = accent,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.height(3.dp))
            Text(
                text = destination.label,
                fontSize = 11.sp,
                lineHeight = 13.sp,
                letterSpacing = 0.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun DestinationGlyph(
    destination: DaoVibeDestination,
    color: Color,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val stroke = Stroke(width = 1.7.dp.toPx(), cap = StrokeCap.Round)
        val center = Offset(size.width / 2f, size.height / 2f)

        when (destination) {
            DaoVibeDestination.Home -> {
                val nodes = listOf(
                    Offset(size.width * 0.5f, size.height * 0.18f),
                    Offset(size.width * 0.18f, size.height * 0.72f),
                    Offset(size.width * 0.82f, size.height * 0.72f)
                )
                nodes.forEach {
                    drawLine(color.copy(alpha = 0.65f), center, it, stroke.width, StrokeCap.Round)
                }
                drawCircle(color, radius = size.minDimension * 0.14f, center = center)
                nodes.forEach {
                    drawCircle(color, radius = size.minDimension * 0.09f, center = it, style = stroke)
                }
            }
            DaoVibeDestination.Mycelium -> {
                drawLine(
                    color = color,
                    start = Offset(size.width * 0.2f, size.height * 0.2f),
                    end = Offset(size.width * 0.8f, size.height * 0.8f),
                    strokeWidth = stroke.width,
                    cap = StrokeCap.Round
                )
                drawLine(
                    color = color.copy(alpha = 0.7f),
                    start = Offset(size.width * 0.8f, size.height * 0.2f),
                    end = Offset(size.width * 0.2f, size.height * 0.8f),
                    strokeWidth = stroke.width,
                    cap = StrokeCap.Round
                )
                drawCircle(color, radius = size.minDimension * 0.1f, center = center)
            }
            DaoVibeDestination.Ledger -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(size.width * 0.18f, size.height * 0.14f),
                    size = Size(size.width * 0.64f, size.height * 0.72f),
                    cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx()),
                    style = stroke
                )
                repeat(3) { index ->
                    val y = size.height * (0.34f + index * 0.16f)
                    drawLine(
                        color.copy(alpha = 0.72f),
                        Offset(size.width * 0.3f, y),
                        Offset(size.width * 0.7f, y),
                        stroke.width
                    )
                }
            }
            DaoVibeDestination.Device -> {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(size.width * 0.2f, size.height * 0.12f),
                    size = Size(size.width * 0.6f, size.height * 0.76f),
                    cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
                    style = stroke
                )
                drawCircle(
                    color = color,
                    radius = size.minDimension * 0.05f,
                    center = Offset(center.x, size.height * 0.76f)
                )
            }
            DaoVibeDestination.Network -> {
                val a = Offset(size.width * 0.2f, size.height * 0.28f)
                val b = Offset(size.width * 0.78f, size.height * 0.26f)
                val c = Offset(size.width * 0.5f, size.height * 0.78f)
                drawLine(color.copy(alpha = 0.66f), a, b, stroke.width, StrokeCap.Round)
                drawLine(color.copy(alpha = 0.66f), b, c, stroke.width, StrokeCap.Round)
                drawLine(color.copy(alpha = 0.66f), c, a, stroke.width, StrokeCap.Round)
                listOf(a, b, c).forEach {
                    drawCircle(color, radius = size.minDimension * 0.09f, center = it)
                }
            }
            DaoVibeDestination.Settings -> {
                drawCircle(color, radius = size.minDimension * 0.32f, center = center, style = stroke)
                drawCircle(color, radius = size.minDimension * 0.1f, center = center)
            }
        }
    }
}

internal fun shortNodeId(nodeId: String?): String =
    when {
        nodeId.isNullOrBlank() -> "creating..."
        nodeId.length <= 18 -> nodeId
        else -> "${nodeId.take(14)}...${nodeId.takeLast(6)}"
    }
