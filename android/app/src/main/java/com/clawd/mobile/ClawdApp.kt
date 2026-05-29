package com.clawd.mobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class ClawdApp : Application() {

    companion object {
        const val CHANNEL_APPROVAL = "clawd_approval"
        const val CHANNEL_STATUS = "clawd_status"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            val approvalChannel = NotificationChannel(
                CHANNEL_APPROVAL,
                getString(R.string.channel_approval),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getString(R.string.channel_approval_desc)
                enableVibration(true)
            }

            val statusChannel = NotificationChannel(
                CHANNEL_STATUS,
                getString(R.string.channel_status),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = getString(R.string.channel_status_desc)
            }

            manager.createNotificationChannel(approvalChannel)
            manager.createNotificationChannel(statusChannel)
        }
    }
}
