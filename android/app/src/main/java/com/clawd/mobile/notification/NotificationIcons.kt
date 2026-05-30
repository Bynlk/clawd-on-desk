package com.clawd.mobile.notification

import android.graphics.*

object NotificationIcons {

    fun coloredCircleBitmap(color: Int, size: Int = 128): Bitmap {
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            style = Paint.Style.FILL
        }
        canvas.drawCircle(size / 2f, size / 2f, size / 2f - 4f, paint)
        return bitmap
    }

    fun coloredCircleDimBitmap(color: Int, size: Int = 128): Bitmap {
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = Color.argb(128, Color.red(color), Color.green(color), Color.blue(color))
            style = Paint.Style.FILL
        }
        canvas.drawCircle(size / 2f, size / 2f, size / 2f - 4f, paint)
        return bitmap
    }

    fun colorForState(state: String): Int = when (state) {
        "working" -> Color.parseColor("#16A34A")
        "juggling" -> Color.parseColor("#B45309")
        "thinking" -> Color.parseColor("#6366F1")
        "attention" -> Color.parseColor("#B45309")
        "error" -> Color.parseColor("#EF4444")
        "notification" -> Color.parseColor("#B45309")
        "idle" -> Color.parseColor("#71717A")
        "sleeping" -> Color.parseColor("#A1A1AA")
        else -> Color.parseColor("#71717A")
    }
}
