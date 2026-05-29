package com.clawd.mobile.ui.theme

import androidx.compose.ui.graphics.Color

// Clawd brand colors — dashboard aligned
val ClawdAccent = Color(0xFFD97757)          // terracotta
val ClawdAccentLight = Color(0xFFE8A08C)
val ClawdAccentDark = Color(0xFFC4684A)

// Light mode
val ClawdBackground = Color(0xFFF5F5F7)
val ClawdSurface = Color(0xFFFFFFFF)
val ClawdSurfaceAlt = Color(0xFFECECEF)
val ClawdText = Color(0xFF18181B)
val ClawdMuted = Color(0xFF6B6B70)
val ClawdSubtle = Color(0xFF9B9BA0)
val ClawdBorder = Color(0x14000000)          // rgba(0,0,0,0.08)

// Dark mode
val ClawdBackgroundDark = Color(0xFF111318)    // mockup page bg
val ClawdSurfaceDark = Color(0xFF1A1D26)      // mockup card bg
val ClawdSurfaceAltDark = Color(0xFF18181B)
val ClawdTextDark = Color(0xFFF2F2F2)        // mockup primary text
val ClawdMutedDark = Color(0xFFA1A1AA)
val ClawdSubtleDark = Color(0xFF71717A)
val ClawdBorderDark = Color(0x12FFFFFF)      // rgba(255,255,255,0.07) mockup

// Status colors — dashboard aligned
val ClawdSuccess = Color(0xFF16803C)         // running green
val ClawdError = Color(0xFFEF4444)           // red
val ClawdWarning = Color(0xFFB45309)         // amber
val ClawdBlue = Color(0xFF3B82F6)            // thinking blue

// Legacy aliases for compatibility
val ClawdBg = ClawdBackgroundDark
val ClawdTextPrimary = ClawdTextDark
val ClawdTextSecondary = ClawdMutedDark
val ClawdTextTertiary = ClawdSubtleDark

// State card border colors — dashboard aligned
val StateError = Color(0xFFEF4444)
val StateAttention = Color(0xFFB45309)
val StateWorking = Color(0xFF16803C)
val StateJuggling = Color(0xFF16803C)
val StateThinking = Color(0xFF3B82F6)
val StateNotification = Color(0xFFD97757)
val StateSweeping = Color(0xFF71717A)
val StateCarrying = Color(0xFF71717A)
val StateIdle = Color(0xFF71717A)
val StateSleeping = Color(0xFFA1A1AA)

// Mockup dark theme — from clawd_mobile_ui_redesign.html
val ClawdBgDark = Color(0xFF111318)           // page background
val ClawdCardDark = Color(0xFF1A1D26)         // card, bottom nav, action buttons
val ClawdCardBorderDark = Color(0x12FFFFFF)   // rgba(255,255,255,0.07) 0.5dp
val ClawdDividerDark = Color(0xFF2E2E35)      // divider
val ClawdFaintDark = Color(0xFF52525B)        // meta text, event label
val ClawdGreenBright = Color(0xFF22C55E)      // connected dot, working badge
val ClawdGreenBg = Color(0x26168060)          // rgba(22,128,60,0.15) connection badge bg
val ClawdGreenBorder = Color(0x4D168060)      // rgba(22,128,60,0.3) connection badge border
val ClawdIconBtnBg = Color(0xFF1E2028)        // QR/settings button background
