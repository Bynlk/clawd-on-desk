package com.clawd.mobile.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.clawd.mobile.ClawdApp
import com.clawd.mobile.MainActivity
import com.clawd.mobile.R
import com.clawd.mobile.data.ConnectionConfig
import com.clawd.mobile.data.PrefsStore
import com.clawd.mobile.ws.ClawdWebSocket
import com.clawd.mobile.ws.ConnectionState
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class WebSocketService : Service() {

    companion object {
        const val CHANNEL_SERVICE = "clawd_service"
        const val NOTIFICATION_ID = 9999
        const val ACTION_CONNECT = "com.clawd.mobile.CONNECT"
        const val ACTION_DISCONNECT = "com.clawd.mobile.DISCONNECT"

        @Volatile
        private var instance: WebSocketService? = null

        fun getWebSocket(): ClawdWebSocket? = instance?.webSocket

        fun isRunning(): Boolean = instance != null

        fun start(context: Context, config: ConnectionConfig? = null) {
            val intent = Intent(context, WebSocketService::class.java).apply {
                action = ACTION_CONNECT
                config?.let {
                    putExtra("host", it.host)
                    putExtra("port", it.port)
                    putExtra("token", it.token)
                }
            }
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, WebSocketService::class.java).apply {
                action = ACTION_DISCONNECT
            })
        }
    }

    private val prefsStore by lazy { PrefsStore(this) }
    var webSocket: ClawdWebSocket? = null
        private set
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var stateCollectorJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        webSocket = ClawdWebSocket(prefsStore)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> {
                startForeground(NOTIFICATION_ID, buildNotification("连接中..."))
                val host = intent.getStringExtra("host")
                val port = intent.getIntExtra("port", 0)
                val token = intent.getStringExtra("token")
                if (host != null && port > 0 && token != null) {
                    webSocket?.connect(ConnectionConfig(host, port, token))
                } else {
                    webSocket?.reconnect()
                }
                startStateCollector()
            }
            ACTION_DISCONNECT -> {
                webSocket?.disconnect()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            else -> {
                // Service restarted by system
                startForeground(NOTIFICATION_ID, buildNotification("已断开"))
                webSocket?.reconnect()
                startStateCollector()
            }
        }
        return START_STICKY
    }

    private fun startStateCollector() {
        stateCollectorJob?.cancel()
        stateCollectorJob = scope.launch {
            launch {
                webSocket?.connectionState?.collect { state ->
                    val status = when (state) {
                        ConnectionState.CONNECTED -> "已连接 - ${webSocket?.currentHost ?: ""}"
                        ConnectionState.CONNECTING -> "连接中..."
                        ConnectionState.RECONNECTING -> "重新连接中..."
                        ConnectionState.AUTH_FAILED -> "认证失败"
                        ConnectionState.DISCONNECTED -> "已断开"
                    }
                    try {
                        val nm = getSystemService(android.app.NotificationManager::class.java)
                        nm.notify(NOTIFICATION_ID, buildNotification(status))
                    } catch (_: Exception) {}
                }
            }
            launch {
                webSocket?.serverDisconnectEvent?.collect {
                    webSocket?.disconnect()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }
    }

    private fun buildNotification(status: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setContentTitle("Clawd Mobile")
            .setContentText(status)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stateCollectorJob?.cancel()
        scope.cancel()
        webSocket?.destroy()
        webSocket = null
        instance = null
        super.onDestroy()
    }
}
