package com.clawd.mobile.data

import androidx.compose.ui.graphics.Color
import kotlinx.serialization.Serializable

@Serializable
data class SessionData(
    val sessionId: String? = null,
    val state: String = "idle",
    val event: String? = null,
    val agentId: String? = null,
    val toolName: String? = null,
    val sessionTitle: String? = null,
    val displayTitle: String? = null,
    val cwd: String? = null,
    val updatedAt: Long? = null,
    val recentEvents: List<RecentEvent> = emptyList(),
    val lastOutput: LastOutput? = null,
    val displayState: String? = null,
    val isReal: Boolean = true,
    // Mobile view model — all from desktop, zero inference on Android
    val badge: String = "idle",
    val chipText: String? = null,
    val chipColor: String? = null,
    val dotColor: String? = null,
    val isVisible: Boolean = true
)

@Serializable
data class LastOutput(
    val toolName: String = "",
    val output: String = "",
    val at: Long = 0
)

@Serializable
data class RecentEvent(
    val at: Long = 0,
    val event: String? = null,
    val state: String? = null
)

data class Session(
    val id: String,
    val data: SessionData
) {
    companion object {
        /** Priority for sorting — lower number = higher priority */
        val STATE_PRIORITY = mapOf(
            "working" to 2, "juggling" to 2,
            "thinking" to 3,
            "notification" to 4, "attention" to 4, "error" to 4,
            "sweeping" to 5, "carrying" to 5,
            "idle" to 6, "sleeping" to 7
        )

        /** Map event names to user-visible Chinese labels */
        fun eventLabel(eventName: String?): String = when (eventName) {
            "UserPromptSubmit" -> "用户输入"
            "PreToolUse" -> "工具启动"
            "PostToolUse" -> "工具完成"
            "PostToolUseFailure" -> "工具失败"
            "Stop" -> "已完成"
            "SessionStart" -> "会话开始"
            "SessionEnd" -> "会话结束"
            "PermissionRequest" -> "需要权限"
            "Elicitation" -> "需要选择"
            "Notification" -> "通知"
            "SubagentStart" -> "子代理启动"
            "SubagentStop" -> "子代理停止"
            else -> eventName ?: ""
        }
    }
}

/** Parse "#RRGGBB" hex color string */
fun parseHexColor(hex: String?): Color? {
    if (hex == null || !hex.startsWith("#") || hex.length != 7) return null
    return try {
        val r = hex.substring(1, 3).toInt(16)
        val g = hex.substring(3, 5).toInt(16)
        val b = hex.substring(5, 7).toInt(16)
        Color(r, g, b)
    } catch (_: NumberFormatException) {
        null
    }
}
