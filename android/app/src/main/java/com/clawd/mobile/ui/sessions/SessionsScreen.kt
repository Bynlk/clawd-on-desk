package com.clawd.mobile.ui.sessions

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.clawd.mobile.data.Session
import com.clawd.mobile.data.SessionData
import com.clawd.mobile.ui.components.ConnectionStatusBar
import com.clawd.mobile.ui.theme.*
import com.clawd.mobile.ws.ConnectionState
import com.clawd.mobile.ws.ClawdWebSocket

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsScreen(
    navController: NavController,
    webSocket: ClawdWebSocket? = null
) {
    val connectionState by (webSocket?.connectionState ?: remember { mutableStateOf(ConnectionState.DISCONNECTED) }).collectAsState()
    val sessionsMap by (webSocket?.sessions ?: remember { mutableStateOf(emptyMap()) }).collectAsState()

    // Convert to sorted list
    val sessions = remember(sessionsMap) {
        sessionsMap.map { (id, data) -> Session(id, data) }
            .sortedWith(compareBy<Session> { it.stateConfig.priority }
                .thenByDescending { it.data.updatedAt ?: 0 })
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Clawd Mobile") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                ),
                actions = {
                    IconButton(onClick = { navController.navigate("scan") }) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = "扫码")
                    }
                    IconButton(onClick = { navController.navigate("manual") }) {
                        Icon(Icons.Default.Settings, contentDescription = "手动连接")
                    }
                }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Connection status bar
            ConnectionStatusBar(state = connectionState)

            if (connectionState == ConnectionState.DISCONNECTED && sessions.isEmpty()) {
                // Empty state
                EmptyState(
                    onScan = { navController.navigate("scan") },
                    onManual = { navController.navigate("manual") }
                )
            } else {
                // Session list
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(sessions, key = { it.id }) { session ->
                        SessionCard(session = session)
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyState(onScan: () -> Unit, onManual: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("🐾", style = MaterialTheme.typography.displayLarge)
            Spacer(modifier = Modifier.height(16.dp))
            Text("扫码配对开始监控", style = MaterialTheme.typography.bodyLarge, color = ClawdTextSecondary)
            Spacer(modifier = Modifier.height(24.dp))
            Button(onClick = onScan) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("扫码配对")
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(onClick = onManual) {
                Text("手动连接")
            }
        }
    }
}

@Composable
private fun SessionCard(session: Session) {
    val config = session.stateConfig
    val data = session.data

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            // Left state color bar
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(Color(config.color))
            )

            Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                // Header: icon + agentId + state label
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(config.icon, style = MaterialTheme.typography.titleLarge)
                    Text(
                        data.agentId ?: "unknown",
                        style = MaterialTheme.typography.labelMedium,
                        color = ClawdTextTertiary,
                        modifier = Modifier
                            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    Text(config.label, style = MaterialTheme.typography.bodySmall, color = ClawdTextSecondary)
                }

                // Session title
                if (!data.sessionTitle.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        data.sessionTitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = ClawdTextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // Tool name
                if (!data.toolName.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("🔧 ${data.toolName}", style = MaterialTheme.typography.bodySmall, color = ClawdTextSecondary)
                }

                // Working directory
                if (!data.cwd.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("📁 ${shortPath(data.cwd)}", style = MaterialTheme.typography.bodySmall, color = ClawdTextTertiary)
                }

                // Updated time
                Spacer(modifier = Modifier.height(8.dp))
                Text(formatAgo(data.updatedAt), style = MaterialTheme.typography.labelSmall, color = ClawdTextTertiary)
            }
        }
    }
}

private fun shortPath(p: String): String {
    val parts = p.split("/", "\\")
    return if (parts.size > 3) ".../${parts.takeLast(2).joinToString("/")}" else p
}

private fun formatAgo(ts: Long?): String {
    if (ts == null) return ""
    val sec = (System.currentTimeMillis() - ts) / 1000
    return when {
        sec < 5 -> "刚刚"
        sec < 60 -> "${sec}秒前"
        sec < 3600 -> "${sec / 60}分钟前"
        else -> "${sec / 3600}小时前"
    }
}
