package com.clawd.mobile.ui.approval

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.clawd.mobile.data.PermissionRequestData
import com.clawd.mobile.notification.ApprovalReceiver
import com.clawd.mobile.notification.NotificationHelper
import com.clawd.mobile.ws.ClawdWebSocket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class ApprovalViewModel(
    application: Application,
    private val webSocket: ClawdWebSocket
) : AndroidViewModel(application) {

    private val _pendingRequests = MutableStateFlow<List<PermissionRequestData>>(emptyList())
    val pendingRequests: StateFlow<List<PermissionRequestData>> = _pendingRequests

    init {
        // Listen for approval requests
        viewModelScope.launch {
            webSocket.permissionRequests.collect { request ->
                handleNewRequest(request)
            }
        }

        // Set BroadcastReceiver callback
        ApprovalReceiver.pendingResponseHandler = { requestId, behavior ->
            handleApprovalResponse(requestId, behavior)
        }
    }

    private fun handleNewRequest(request: PermissionRequestData) {
        _pendingRequests.value = _pendingRequests.value + request

        val context = getApplication<Application>()
        NotificationHelper.showApprovalNotification(context, request)
    }

    private fun handleApprovalResponse(requestId: String, behavior: String) {
        webSocket.sendPermissionResponse(requestId, behavior)
        _pendingRequests.value = _pendingRequests.value.filter { it.requestId != requestId }
    }

    fun approve(requestId: String) {
        handleApprovalResponse(requestId, "allow")
    }

    fun deny(requestId: String) {
        handleApprovalResponse(requestId, "deny")
    }
}
