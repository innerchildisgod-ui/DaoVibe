package org.daovibe.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

internal object DaoVibeColors {
    val Background = Color(0xFF050A14)
    val BackgroundRaised = Color(0xFF08111F)
    val Surface = Color(0xFF0D1828)
    val SurfaceRaised = Color(0xFF111F34)
    val Border = Color(0xFF203753)
    val BorderSoft = Color(0xFF162A42)
    val Cyan = Color(0xFF22D3EE)
    val Blue = Color(0xFF3B82F6)
    val Violet = Color(0xFFA78BFA)
    val Green = Color(0xFF48D597)
    val Amber = Color(0xFFF1C95A)
    val TextPrimary = Color(0xFFEAF6FF)
    val TextSecondary = Color(0xFFA6B7CC)
    val TextMuted = Color(0xFF74869B)
}

private val DaoVibeColorScheme = darkColorScheme(
    primary = DaoVibeColors.Cyan,
    onPrimary = DaoVibeColors.Background,
    secondary = DaoVibeColors.Blue,
    onSecondary = DaoVibeColors.TextPrimary,
    tertiary = DaoVibeColors.Violet,
    onTertiary = DaoVibeColors.Background,
    background = DaoVibeColors.Background,
    onBackground = DaoVibeColors.TextPrimary,
    surface = DaoVibeColors.Surface,
    onSurface = DaoVibeColors.TextPrimary,
    surfaceVariant = DaoVibeColors.SurfaceRaised,
    onSurfaceVariant = DaoVibeColors.TextSecondary,
    outline = DaoVibeColors.Border
)

private val DaoVibeTypography = Typography(
    displayMedium = TextStyle(
        fontSize = 40.sp,
        lineHeight = 46.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.sp
    ),
    headlineSmall = TextStyle(
        fontSize = 26.sp,
        lineHeight = 32.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.sp
    ),
    titleLarge = TextStyle(
        fontSize = 21.sp,
        lineHeight = 28.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp
    ),
    titleMedium = TextStyle(
        fontSize = 17.sp,
        lineHeight = 24.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp
    ),
    bodyLarge = TextStyle(
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.sp
    ),
    bodyMedium = TextStyle(
        fontSize = 14.sp,
        lineHeight = 21.sp,
        letterSpacing = 0.sp
    ),
    labelLarge = TextStyle(
        fontSize = 14.sp,
        lineHeight = 18.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp
    ),
    labelMedium = TextStyle(
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 0.sp
    )
)

@Composable
internal fun DaoVibeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DaoVibeColorScheme,
        typography = DaoVibeTypography,
        content = content
    )
}
