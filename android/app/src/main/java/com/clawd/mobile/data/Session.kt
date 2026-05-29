package com.clawd.mobile.data

import kotlinx.serialization.Serializable

@Serializable
data class SessionData(
    val state: String = "idle",
    val event: String? = null,
    val agentId: String? = null,
    val toolName: String? = null,
    val sessionTitle: String? = null,
    val cwd: String? = null,
    val updatedAt: Long? = null
)

data class Session(
    val id: String,
    val data: SessionData
) {
    companion object {
        val STATE_CONFIG = mapOf(
            "error" to StateConfig("❌", 0xFFD63031, 0, "错误"),
            "attention" to StateConfig("⚠️", 0xFFE17055, 1, "需要关注"),
            "working" to StateConfig("⚙️", 0xFF6C5CE7, 2, "工作中"),
            "juggling" to StateConfig("🤹", 0xFFA29BFE, 2, "多任务"),
            "thinking" to StateConfig("🤔", 0xFF0984E3, 3, "思考中"),
            "notification" to StateConfig("🔔", 0xFF00CEC9, 4, "通知"),
            "sweeping" to StateConfig("🧹", 0xFF636E72, 5, "清理中"),
            "carrying" to StateConfig("📦", 0xFF636E72, 5, "搬运中"),
            "idle" to StateConfig("😴", 0xFFB2BEC3, 6, "空闲"),
            "sleeping" to StateConfig("💤", 0xFF2D3436, 7, "休眠"),
        )
    }

    val stateConfig: StateConfig
        get() = STATE_CONFIG[data.state] ?: STATE_CONFIG["idle"]!!
}

data class StateConfig(
    val icon: String,
    val color: Long,
    val priority: Int,
    val label: String
)
