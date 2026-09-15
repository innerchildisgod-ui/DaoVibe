package org.daovibe.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
internal fun SplashScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DaoVibeColors.Background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            MyceliumMark(modifier = Modifier.size(156.dp))
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "DAOVibe",
                style = MaterialTheme.typography.displayMedium,
                color = DaoVibeColors.TextPrimary,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "People-owned computational civilization",
                style = MaterialTheme.typography.bodyLarge,
                color = DaoVibeColors.TextSecondary,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(18.dp))
            StatusChip(
                text = "Local-first packet core",
                accentColor = DaoVibeColors.Cyan
            )
        }
    }
}

@Composable
private fun MyceliumMark(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val lineWidth = 2.dp.toPx()
        val nodeRadius = size.minDimension * 0.045f
        val centerRadius = size.minDimension * 0.085f
        val nodes = listOf(
            Offset(size.width * 0.50f, size.height * 0.12f),
            Offset(size.width * 0.22f, size.height * 0.28f),
            Offset(size.width * 0.78f, size.height * 0.30f),
            Offset(size.width * 0.18f, size.height * 0.66f),
            Offset(size.width * 0.54f, size.height * 0.54f),
            Offset(size.width * 0.82f, size.height * 0.72f),
            Offset(size.width * 0.42f, size.height * 0.88f)
        )
        val links = listOf(
            0 to 1,
            0 to 2,
            1 to 4,
            2 to 4,
            3 to 4,
            4 to 5,
            4 to 6,
            3 to 6,
            2 to 5
        )

        links.forEachIndexed { index, pair ->
            drawLine(
                color = if (index % 3 == 0) {
                    DaoVibeColors.Violet.copy(alpha = 0.28f)
                } else {
                    DaoVibeColors.Cyan.copy(alpha = 0.36f)
                },
                start = nodes[pair.first],
                end = nodes[pair.second],
                strokeWidth = lineWidth,
                cap = StrokeCap.Round
            )
        }

        drawCircle(
            color = DaoVibeColors.Cyan.copy(alpha = 0.12f),
            radius = centerRadius * 1.9f,
            center = nodes[4]
        )
        drawCircle(
            color = DaoVibeColors.Cyan,
            radius = centerRadius,
            center = nodes[4]
        )

        nodes.forEachIndexed { index, offset ->
            if (index != 4) {
                val color = if (index % 2 == 0) DaoVibeColors.Cyan else DaoVibeColors.Violet
                drawCircle(
                    color = color.copy(alpha = 0.11f),
                    radius = nodeRadius * 2.0f,
                    center = offset
                )
                drawCircle(
                    color = color,
                    radius = nodeRadius,
                    center = offset
                )
                drawCircle(
                    color = color.copy(alpha = 0.52f),
                    radius = nodeRadius * 1.55f,
                    center = offset,
                    style = Stroke(width = 1.dp.toPx())
                )
            }
        }
    }
}
