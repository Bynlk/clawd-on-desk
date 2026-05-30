package com.clawd.mobile.notification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import com.clawd.mobile.MainActivity
import com.clawd.mobile.data.PrefsStore
import com.clawd.mobile.data.Session
import com.clawd.mobile.data.SessionData

class StatusNotifier(private val context: Context, private val prefsStore: PrefsStore) {

    companion object {
        /** Tracks last notified display state to dedup display-level alerts */
        private var lastDisplayState: String? = null
        /** Tracks session IDs that already received a "done" notification */
        private val notifiedSessionDone = mutableSetOf<String>()
    }

    /** Set by NavGraph to check if there are pending approval requests */
    var hasPendingApprovals: () -> Boolean = { false }

    /** Resolve display name: custom > sessionTitle > agentId > sessionId */
    private fun resolveName(sessionId: String, data: SessionData): String {
        return prefsStore.getSessionName(sessionId)
            ?: data.sessionTitle
            ?: data.agentId
            ?: sessionId
    }

    /**
     * Unified notification entry point — called on every displayState or sessions change.
     * Handles both display-level alerts (idle/attention/error) and per-session "done" alerts,
     * ensuring at most one "搞定啦" notification per completion event.
     */
    fun updateNotifications(displayState: String, sessions: Map<String, SessionData>) {
        if (!prefsStore.isNotifyEnabled()) return

        // --- Per-session "done" notifications ---
        if (prefsStore.isNotifyAlert()) {
            val currentDone = sessions
                .map { (id, data) -> id to Session(id, data) }
                .filter { it.second.badge == "done" }
                .map { it.first }
                .toSet()

            val newDone = currentDone - notifiedSessionDone
            notifiedSessionDone.retainAll(currentDone)
            notifiedSessionDone.addAll(currentDone)

            for (sid in newDone) {
                val data = sessions[sid] ?: continue
                val name = resolveName(sid, data)
                Log.d("StatusNotifier", "sessionDone sid=$sid name=$name")
                showSessionDoneNotification(sid, name)
            }
        }

        // --- Display-level alert (idle/attention/error) ---
        if (displayState == lastDisplayState) return
        val prevState = lastDisplayState
        lastDisplayState = displayState

        val hasApprovals = hasPendingApprovals()
        val shouldAlert = when (displayState) {
            // Don't fire display-level "idle" alert if we just fired a per-session "done"
            // notification above — avoids the double-notification problem.
            "idle" -> {
                val hasNewDone = sessions.any { (id, data) ->
                    Session(id, data).badge == "done" && id in notifiedSessionDone
                }
                prefsStore.isNotifyAlert() && !hasNewDone
            }
            "sweeping" -> prefsStore.isNotifyAlert()
            "attention", "error" -> prefsStore.isNotifyAlert() && hasApprovals
            else -> false
        }

        // Resolve session name by sessionId (find most recently updated active session)
        val name = sessions.entries
            .maxByOrNull { it.value.updatedAt ?: 0L }
            ?.let { resolveName(it.key, it.value) }
            ?: "Clawd"

        Log.d("StatusNotifier", "displayState=$displayState prev=$prevState shouldAlert=$shouldAlert hasApprovals=$hasApprovals name=$name")

        if (shouldAlert) {
            showAlertNotification(displayState, name)
        }
    }

    private fun showAlertNotification(displayState: String, name: String) {
        val (alertTitle, alertText) = when (displayState) {
            "idle", "sweeping" -> "$name 搞定啦" to "快来看看成果！"
            "attention" -> "$name 遇到麻烦了" to "来看看？"
            "error" -> "$name 出错了" to "需要你关注一下"
            else -> return
        }
        Log.d("StatusNotifier", "NOTIFY: $alertTitle | $alertText")

        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPending = PendingIntent.getActivity(
            context, "alert:$displayState".hashCode(), openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, NotificationHelper.CHANNEL_ALERT)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(alertTitle)
            .setContentText(alertText)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openPending)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify("alert:$displayState".hashCode(), notification)
    }

    private fun showSessionDoneNotification(sessionId: String, name: String) {
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPending = PendingIntent.getActivity(
            context, "done:$sessionId".hashCode(), openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, NotificationHelper.CHANNEL_ALERT)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("$name 搞定啦")
            .setContentText("快来看看成果！")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openPending)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify("done:$sessionId".hashCode(), notification)
    }

    fun clearSession(sessionId: String) {
        notifiedSessionDone.remove(sessionId)
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel("done:$sessionId".hashCode())
        manager.cancel("alert:$sessionId".hashCode())
    }
}
