package com.clawd.mobile.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ApprovalReceiver : BroadcastReceiver() {

    companion object {
        // Shared callback set by ApprovalViewModel
        var pendingResponseHandler: ((String, String) -> Unit)? = null
    }

    override fun onReceive(context: Context, intent: Intent) {
        val requestId = intent.getStringExtra("request_id") ?: return
        val notificationId = intent.getIntExtra("notification_id", -1)

        val behavior = when (intent.action) {
            "ACTION_APPROVE" -> "allow"
            "ACTION_DENY" -> "deny"
            else -> return
        }

        // Send response via callback
        pendingResponseHandler?.invoke(requestId, behavior)

        // Dismiss notification
        if (notificationId >= 0) {
            NotificationHelper.cancelNotification(context, notificationId)
        }
    }
}
