package com.clawd.mobile.ui.navigation

import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.clawd.mobile.data.PrefsStore
import com.clawd.mobile.notification.StatusNotifier
import com.clawd.mobile.ui.approval.ApprovalViewModel
import com.clawd.mobile.ui.sessions.SessionsScreen
import com.clawd.mobile.ui.scan.ScanScreen
import com.clawd.mobile.ui.manual.ManualScreen
import com.clawd.mobile.ws.ClawdWebSocket

@Composable
fun ClawdNavGraph() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val prefsStore = remember { PrefsStore(context) }
    val webSocket = remember { ClawdWebSocket(prefsStore) }
    val statusNotifier = remember { StatusNotifier(context) }
    val approvalViewModel: ApprovalViewModel = viewModel(
        factory = ApprovalViewModel.Factory(context.applicationContext as android.app.Application, webSocket)
    )

    // Try auto-reconnect to last connection
    LaunchedEffect(Unit) {
        webSocket.reconnect()
    }

    // Monitor session changes for notifications
    LaunchedEffect(webSocket) {
        webSocket.sessions.collect { sessionsMap ->
            sessionsMap.forEach { (id, data) ->
                statusNotifier.onSessionUpdate(id, data)
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose { webSocket.destroy() }
    }

    NavHost(navController = navController, startDestination = "sessions") {
        composable("sessions") {
            SessionsScreen(
                navController = navController,
                webSocket = webSocket,
                approvalViewModel = approvalViewModel
            )
        }
        composable("scan") {
            ScanScreen(
                onBack = { navController.popBackStack() },
                onScanned = { config ->
                    webSocket.connect(config)
                    navController.navigate("sessions") {
                        popUpTo("sessions") { inclusive = true }
                    }
                }
            )
        }
        composable("manual") {
            ManualScreen(
                prefsStore = prefsStore,
                onBack = { navController.popBackStack() },
                onConnect = { config ->
                    webSocket.connect(config)
                    navController.navigate("sessions") {
                        popUpTo("sessions") { inclusive = true }
                    }
                }
            )
        }
    }
}
