package com.clawd.mobile.notification

import android.app.NotificationManager
import android.content.Context
import com.clawd.mobile.data.SessionData

class StatusNotifier(private val context: Context) {

    // Track previous state to avoid duplicate notifications
    private val lastState = mutableMapOf<String, String>()
    // Per-session notification IDs for collapsing
    private val sessionNotificationIds = mutableMapOf<String, Int>()
    private var nextId = 2000

    fun onSessionUpdate(sessionId: String, data: SessionData) {
        val prevState = lastState[sessionId]
        val newState = data.state
        lastState[sessionId] = newState

        // State unchanged, skip
        if (prevState == newState) return

        // Only notify for significant transitions
        when (newState) {
            "attention" -> {
                showNotification(
                    sessionId,
                    "需要关注",
                    data.sessionTitle ?: "${data.agentId} 需要关注",
                    android.app.Notification.PRIORITY_HIGH
                )
            }
            "error" -> {
                showNotification(
                    sessionId,
                    "出现错误",
                    data.sessionTitle ?: "${data.agentId} 遇到错误",
                    android.app.Notification.PRIORITY_HIGH
                )
            }
            "notification" -> {
                showNotification(
                    sessionId,
                    "通知",
                    data.sessionTitle ?: "${data.agentId} 发送通知"
                )
            }
            "idle" -> {
                if (prevState == "working" || prevState == "thinking") {
                    showNotification(
                        sessionId,
                        "任务完成",
                        data.sessionTitle ?: "${data.agentId} 已完成"
                    )
                }
            }
            "sleeping" -> {
                if (prevState != null && prevState != "sleeping") {
                    showNotification(
                        sessionId,
                        "会话结束",
                        data.sessionTitle ?: "${data.agentId} 已结束",
                        android.app.Notification.PRIORITY_LOW
                    )
                }
            }
        }
    }

    private fun showNotification(sessionId: String, title: String, body: String, priority: Int = android.app.Notification.PRIORITY_DEFAULT) {
        // Use consistent ID per session so notifications collapse
        val id = sessionNotificationIds.getOrPut(sessionId) { nextId++ }
        NotificationHelper.showStatusNotification(context, title, body, priority)
    }

    fun clearSession(sessionId: String) {
        lastState.remove(sessionId)
        // Read the notification ID before removing from map
        val id = sessionNotificationIds.remove(sessionId)
        if (id != null) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.cancel(id)
        }
    }
}
