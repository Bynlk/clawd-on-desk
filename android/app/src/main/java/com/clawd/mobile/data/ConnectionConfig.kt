package com.clawd.mobile.data

import kotlinx.serialization.Serializable

@Serializable
data class ConnectionConfig(
    val host: String,
    val port: Int,
    val token: String
) {
    fun wsUrl(): String = "ws://$host:$port/ws?token=$token"

    fun pairUrl(): String = "clawd://$host:$port/$token"

    companion object {
        fun fromClawdUrl(url: String): ConnectionConfig? {
            val regex = Regex("^clawd://([^:]+):(\\d+)/([a-f0-9]{16,})$")
            val match = regex.matchEntire(url) ?: return null
            return ConnectionConfig(
                host = match.groupValues[1],
                port = match.groupValues[2].toInt(),
                token = match.groupValues[3]
            )
        }
    }
}
