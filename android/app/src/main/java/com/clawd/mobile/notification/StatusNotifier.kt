package com.clawd.mobile.notification

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import com.clawd.mobile.data.SessionData

class StatusNotifier(private val context: Context) {

    private val sessionStates = mutableMapOf<String, String>()
    private val sessionTitles = mutableMapOf<String, String>()

    fun onSessionUpdate(sessionId: String, data: SessionData) {
        val prevState = sessionStates[sessionId]
        val newState = data.state
        sessionStates[sessionId] = newState
        sessionTitles[sessionId] = data.sessionTitle ?: data.agentId ?: sessionId

        if (prevState == newState) return

        val shouldAlert = when {
            newState == "idle" && (prevState == "working" || prevState == "thinking") -> true
            newState == "attention" || newState == "error" -> true
            else -> false
        }

        if (shouldAlert) {
            showAlertNotification(sessionId)
        }
    }

    private fun showAlertNotification(sessionId: String) {
        val title = sessionTitles[sessionId] ?: sessionId
        val state = sessionStates[sessionId] ?: return
        val alertTitle = when (state) {
            "idle" -> "任务完成"
            "attention" -> "需要关注"
            "error" -> "出现错误"
            else -> return
        }

        val notification = NotificationCompat.Builder(context, NotificationHelper.CHANNEL_ALERT)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(alertTitle)
            .setContentText(title)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify("alert:$sessionId".hashCode(), notification)
    }

    fun clearSession(sessionId: String) {
        sessionStates.remove(sessionId)
        sessionTitles.remove(sessionId)
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel("alert:$sessionId".hashCode())
    }
}
