package com.clawd.mobile.ui.manual

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.clawd.mobile.data.ConnectionConfig
import com.clawd.mobile.data.PrefsStore

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManualScreen(
    prefsStore: PrefsStore,
    onBack: () -> Unit,
    onConnect: (ConnectionConfig) -> Unit
) {
    var host by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("23334") }
    var token by remember { mutableStateOf("") }
    var showError by remember { mutableStateOf(false) }
    val history = remember { mutableStateOf(prefsStore.getHistory()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("手动连接") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = host,
                onValueChange = { host = it },
                label = { Text("桌面端地址") },
                placeholder = { Text("192.168.1.10") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = port,
                onValueChange = { port = it },
                label = { Text("端口") },
                placeholder = { Text("23334") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("Token") },
                placeholder = { Text("32位token") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            if (showError) {
                Text(
                    "请填写完整连接信息",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Button(
                onClick = {
                    val p = port.toIntOrNull()
                    if (host.isBlank() || p == null || token.isBlank()) {
                        showError = true
                    } else {
                        showError = false
                        onConnect(ConnectionConfig(host, p, token))
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("连接")
            }

            if (history.value.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text("连接历史", style = MaterialTheme.typography.titleSmall)
                history.value.forEachIndexed { index, config ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "${config.host}:${config.port}",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = { onConnect(config) }) {
                            Text("连接")
                        }
                        TextButton(onClick = {
                            prefsStore.removeFromHistory(index)
                            history.value = prefsStore.getHistory()
                        }) {
                            Text("删除")
                        }
                    }
                }
            }
        }
    }
}
