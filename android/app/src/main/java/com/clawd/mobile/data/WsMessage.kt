package com.clawd.mobile.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class WsMessage(
    val type: String,
    val timestamp: Long = 0,
    val sessionId: String? = null,
    val sessions: Map<String, SessionData>? = null,
    val data: SessionData? = null,
    val requestId: String? = null,
    val permissionData: PermissionRequestData? = null,
    val elicitationData: ElicitationRequestData? = null,
)

@Serializable
data class PermissionRequestData(
    val agentId: String? = null,
    val toolName: String? = null,
    val toolInputSummary: String? = null,
    val sessionId: String? = null,
    val suggestions: List<PermissionSuggestion> = emptyList(),
    val elicitationOptions: List<ElicitationOption> = emptyList(),
    val timeout: Long = 60000,
    val requestId: String? = null,
)

@Serializable
data class PermissionSuggestion(
    val label: String,
    val behavior: String,  // "allow" or "deny"
    val rule: String? = null,
    val type: String? = null,
    val mode: String? = null,
)

@Serializable
data class ElicitationRequestData(
    val agentId: String? = null,
    val prompt: String? = null,
    val options: List<ElicitationOption> = emptyList(),
    val sessionId: String? = null,
)

@Serializable
data class ElicitationOption(
    val label: String,
    val value: String,
)
