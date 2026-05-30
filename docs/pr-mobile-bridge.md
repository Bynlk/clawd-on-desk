# PR: Add LAN WebSocket bridge for PWA mobile clients

## Summary

Adds a minimal WebSocket bridge server that exposes Clawd session state and permission requests to PWA mobile clients over LAN. The PWA connects via `ws://<host>:23334/ws?token=<hex>` and receives real-time state updates and permission approval flows.

## What changed

### New files
| File | Lines | Purpose |
|------|-------|---------|
| `src/network/lan-ws-server.js` | ~280 | WebSocket + HTTP bridge server |
| `pwa/` (6 files) | ~1900 | PWA shell (copied from clawd-on-desk, zero modifications) |
| `test/lan-ws-server.test.js` | ~230 | 9 test cases covering connection, state, permissions |
| `docs/mobile-protocol-v1.md` | ~180 | Protocol v1 specification |

### Modified files
| File | Change |
|------|--------|
| `src/main.js` | +18 lines: init/start/cleanup hooks for LAN bridge |

### Untouched core files
- `src/server.js` — no changes
- `src/state.js` — no changes
- `src/permission.js` — no changes

## Architecture

```
Clawd Desktop (Electron)
  ├── HTTP Server (127.0.0.1:23333) — hook scripts
  └── LAN WS Bridge (0.0.0.0:23334) — PWA clients
        ├── WebSocket /ws?token=<hex>
        └── Static /mobile/* (PWA files)

PWA (mobile browser)
  ├── Service Worker (offline cache)
  ├── Session renderer
  └── Permission approval panel
```

## How it works

1. Bridge starts on `0.0.0.0:23334`, serves PWA files + WebSocket
2. Token generated once, persisted at `~/.clawd/mobile-token.json`
3. Session state polled every 2s from the shared `sessions` Map
4. Permission requests broadcast in real-time via `onPermissionsChanged` hook
5. PWA responses route through `resolvePermissionEntry` (same as desktop bubble / Telegram)

## Protocol v1

All server messages include `version: "v1"`. Message types:
- `snapshot` — full session state on connect
- `state` — incremental session update
- `session_deleted` — session removed
- `permission_request` / `elicitation_request` — needs user approval
- `permission_dismissed` — resolved (from any client)
- Client sends: `permission_response` / `elicitation_response`

Full schema: `docs/mobile-protocol-v1.md`

## Security

- Token-based auth (32-char hex, validated on WS upgrade)
- LAN-only binding (`0.0.0.0` but no port forwarding intended)
- Rate limiting: 60 msg/60s per client
- Max 10 concurrent clients
- Invalid token → close code 1008

## Tests

```
node --test test/lan-ws-server.test.js
```

9 tests covering:
- Protocol version field
- Server startup and port binding
- Static file serving
- Token rejection
- Connection + snapshot delivery
- State broadcast
- Session deletion broadcast
- Permission request → approve → resolve → dismiss flow

## Limitations

- No TLS (LAN only)
- Session state has up to 2s latency (poll interval)
- `tool_output` not yet bridged (planned for v2)
- Token not revocable without file deletion

## Testing checklist

- [ ] `npm test` passes (existing + new tests)
- [ ] PWA loads at `http://<lan-ip>:23334/mobile/`
- [ ] QR scan connects successfully
- [ ] Session state updates appear in PWA
- [ ] Permission request shows in PWA, approve resolves on desktop
- [ ] Disconnect/reconnect works
- [ ] Invalid token rejected
