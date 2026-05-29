package com.clawd.mobile.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val ClawdDarkColorScheme = darkColorScheme(
    primary = ClawdAccent,
    onPrimary = Color.White,
    primaryContainer = ClawdAccentDark,
    onPrimaryContainer = Color.White,
    secondary = ClawdAccentLight,
    onSecondary = Color.White,
    background = ClawdBg,
    onBackground = ClawdTextPrimary,
    surface = ClawdSurface,
    onSurface = ClawdTextPrimary,
    surfaceVariant = ClawdSurfaceLight,
    onSurfaceVariant = ClawdTextSecondary,
    error = ClawdError,
    onError = Color.White,
    outline = Color(0xFF333340),
    outlineVariant = Color(0xFF222230),
)

@Composable
fun ClawdMobileTheme(content: @Composable () -> Unit) {
    val colorScheme = ClawdDarkColorScheme
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = ClawdBg.toArgb()
            window.navigationBarColor = ClawdBg.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = ClawdTypography,
        content = content
    )
}
