package com.clawd.mobile.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import com.clawd.mobile.ui.theme.*
import com.clawd.mobile.ws.ConnectionState

@Composable
fun ConnectionStatusBar(state: ConnectionState) {
    val color = when (state) {
        ConnectionState.CONNECTED -> ClawdSuccess
        ConnectionState.CONNECTING -> ClawdWarning
        ConnectionState.RECONNECTING -> ClawdError.copy(alpha = 0.7f)
        ConnectionState.AUTH_FAILED -> ClawdError
        ConnectionState.DISCONNECTED -> ClawdTextTertiary
    }

    val text = when (state) {
        ConnectionState.CONNECTED -> "已连接"
        ConnectionState.CONNECTING -> "连接中..."
        ConnectionState.RECONNECTING -> "重连中..."
        ConnectionState.AUTH_FAILED -> "认证失败"
        ConnectionState.DISCONNECTED -> "未连接"
    }

    // Pulse animation
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.4f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = EaseInOut),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .alpha(if (state.isConnecting) pulseAlpha else 1f)
                .background(color, CircleShape)
        )
        Text(text, style = MaterialTheme.typography.bodySmall, color = color)
    }
}
