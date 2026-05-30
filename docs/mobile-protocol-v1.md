# Clawd Mobile Protocol v1

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Clawd Desktop                      │
│                                                      │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  State    │──▶│ LAN WS Bridge│──▶│  HTTP Server  │ │
│  │  Engine   │   │  (0.0.0.0)   │   │  (PWA files)  │ │
│  └──────────┘   └──────┬───────┘   └──────────────┘ │
│       │                │                              │
│  ┌──────────┐   ┌──────┴───────┐                     │
│  │Permission│──▶│  WebSocket   │                     │
│  │ System   │   │  /ws?token=  │                     │
│  └──────────┘   └──────────────┘                     │
└────────────────────────┬────────────────────────────┘
                         │ LAN (Wi-Fi / Ethernet)
                         │ ws://<host>:23334/ws?token=<hex>
                         │
┌────────────────────────┴────────────────────────────┐
│                  PWA (Mobile Browser)                 │
│                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐ │
│  │ Service  │   │  Session  │   │    Approval      │ │
│  │ Worker   │   │  Renderer │   │    Manager       │ │
│  └──────────┘   └──────────┘   └──────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Security Model

- **Token**: 32-char hex, generated once, persisted at `~/.clawd/mobile-token.json`
- **Transport**: plaintext WebSocket over LAN only (no TLS, no Internet exposure)
- **Binding**: `0.0.0.0:<port>` — reachable by any device on the same LAN
- **Auth**: token validated on WebSocket upgrade; invalid token → close code 1008
- **Rate limit**: 60 messages per 60s per client
- **Max clients**: 10 concurrent connections

## Connection Flow

```
Mobile                          Desktop
  │                                │
  │  1. Scan QR / manual input     │
  │     (host:port:token)          │
  │                                │
  │  2. WS connect                 │
  │     /ws?token=<hex>            │
  │  ─────────────────────────▶    │
  │                                │  3. Validate token
  │                                │     Reject → 1008
  │  ◀─────────────────────────    │
  │  4. snapshot (full state)      │
  │                                │
  │  ◀─────────────────────────    │  5. state (incremental)
  │  ◀─────────────────────────    │  6. permission_request
  │                                │
  │  7. permission_response        │
  │  ─────────────────────────▶    │
  │                                │  8. Resolve → HTTP response
  │  ◀─────────────────────────    │  9. permission_dismissed
  │                                │
  │  ◀────── ping ────────────     │  10. Heartbeat (30s)
  │  ──────── pong ───────────▶    │
  │                                │
```

## Protocol

All messages are JSON. Every message from the server includes:

| Field       | Type   | Description                    |
|-------------|--------|--------------------------------|
| `version`   | string | Always `"v1"`                  |
| `type`      | string | Message type                   |
| `timestamp` | number | Unix ms                        |

### Server → Client

#### `snapshot`

Sent on initial connection. Contains full session state.

```json
{
  "version": "v1",
  "type": "snapshot",
  "timestamp": 1717200000000,
  "sessions": {
    "<sessionId>": {
      "sessionId": "abc123",
      "state": "working",
      "agentId": "claude-code",
      "cwd": "/home/user/project",
      "sessionTitle": "Fix auth bug",
      "updatedAt": 1717200000000,
      "recentEvents": [
        { "event": "PreToolUse", "at": 1717199990000, "state": "working" }
      ],
      "isReal": true
    }
  }
}
```

#### `state`

Incremental session state update.

```json
{
  "version": "v1",
  "type": "state",
  "timestamp": 1717200001000,
  "sessionId": "abc123",
  "data": {
    "sessionId": "abc123",
    "state": "thinking",
    "agentId": "claude-code",
    "cwd": "/home/user/project",
    "updatedAt": 1717200001000,
    "recentEvents": [],
    "isReal": true
  }
}
```

#### `session_deleted`

```json
{
  "version": "v1",
  "type": "session_deleted",
  "timestamp": 1717200002000,
  "sessionId": "abc123"
}
```

#### `permission_request`

```json
{
  "version": "v1",
  "type": "permission_request",
  "timestamp": 1717200003000,
  "requestId": "perm_1717200003000",
  "data": {
    "agentId": "claude-code",
    "toolName": "Bash",
    "toolInputSummary": "Run npm test",
    "suggestions": [
      { "label": "Allow", "behavior": "allow" },
      { "label": "Deny", "behavior": "deny" }
    ],
    "sessionFolder": "project",
    "sessionShortId": "123",
    "timeout": 90000
  }
}
```

#### `elicitation_request`

```json
{
  "version": "v1",
  "type": "elicitation_request",
  "timestamp": 1717200004000,
  "requestId": "perm_1717200004000",
  "data": {
    "agentId": "claude-code",
    "toolName": "AskUserQuestion",
    "prompt": "Which framework?",
    "suggestions": [],
    "timeout": 90000
  }
}
```

#### `permission_dismissed`

Sent when a permission is resolved (from any client or desktop bubble).

```json
{
  "version": "v1",
  "type": "permission_dismissed",
  "timestamp": 1717200005000,
  "requestId": "perm_1717200003000"
}
```

### Client → Server

#### `permission_response`

```json
{
  "type": "permission_response",
  "requestId": "perm_1717200003000",
  "behavior": "allow"
}
```

`behavior`: `"allow"` | `"deny"`

#### `elicitation_response`

```json
{
  "type": "elicitation_response",
  "requestId": "perm_1717200004000",
  "answers": { "value": "React" }
}
```

## Limitations

- No TLS — LAN only, not suitable for untrusted networks
- No authentication beyond shared token — token compromise = full access
- Session data is eventually consistent (2s poll interval for state changes)
- Permission requests are real-time; session state changes have up to 2s latency
- `tool_output` messages are not yet bridged (planned for v2)
- Max 10 concurrent PWA clients
- Token is not revocable without manual file deletion
