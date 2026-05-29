package com.clawd.mobile.ws

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    AUTH_FAILED;

    val isConnected: Boolean get() = this == CONNECTED
    val isConnecting: Boolean get() = this == CONNECTING || this == RECONNECTING
}
