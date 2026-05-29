package com.clawd.mobile.ws

import com.clawd.mobile.data.WsMessage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

object MessageParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun parse(text: String): WsMessage? {
        return try {
            json.decodeFromString<WsMessage>(text)
        } catch (e: Exception) {
            // Try manual parse for incomplete messages
            try {
                val obj = json.decodeFromString<JsonObject>(text)
                val type = obj["type"]?.jsonPrimitive?.contentOrNull ?: return null
                WsMessage(type = type, timestamp = obj["timestamp"]?.jsonPrimitive?.contentOrNull?.toLongOrNull() ?: 0)
            } catch (_: Exception) { null }
        }
    }

    fun encodePermissionResponse(requestId: String, behavior: String, suggestionIndex: Int? = null): String {
        return buildString {
            append("""{"type":"permission_response","requestId":"$requestId","behavior":"$behavior"""")
            if (suggestionIndex != null) {
                append(""","suggestionIndex":$suggestionIndex""")
            }
            append("}")
        }
    }

    fun encodeElicitationResponse(requestId: String, answers: Map<String, String>): String {
        val answersJson = answers.entries.joinToString(",") { "\"${it.key}\":\"${it.value}\"" }
        return """{"type":"elicitation_response","requestId":"$requestId","answers":{$answersJson}}"""
    }
}
