// src/network/lan-ws-server.js — LAN WebSocket bridge for PWA mobile clients
// Protocol v1 — serves static PWA files + WebSocket on 0.0.0.0 for LAN access.

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const WebSocket = require("ws");

const PROTOCOL_VERSION = "v1";
const DEFAULT_PORT = 23334;
const PORT_RANGE = 5;
const HEARTBEAT_MS = 30000;
const CLIENT_TIMEOUT_MS = 90000;
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 60;
const MAX_CLIENTS = 10;
const SESSION_POLL_MS = 2000;

const PWA_DIR = path.resolve(__dirname, "../../pwa");
const TOKEN_PATH = path.join(os.homedir(), ".clawd", "mobile-token.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function loadOrCreateToken() {
  try {
    const raw = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    if (raw && typeof raw.token === "string" && /^[a-f0-9]{32,64}$/.test(raw.token)) return raw.token;
  } catch {}
  const token = crypto.randomBytes(16).toString("hex");
  try {
    const dir = path.dirname(TOKEN_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = TOKEN_PATH + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify({ token }, null, 2), "utf8");
    fs.renameSync(tmpPath, TOKEN_PATH);
  } catch {}
  return token;
}

function buildMessage(type, payload) {
  return JSON.stringify({ version: PROTOCOL_VERSION, type, timestamp: Date.now(), ...payload });
}

function initLanWsServer(ctx) {
  const token = loadOrCreateToken();
  const clients = new Set();
  const clientMeta = new Map();
  const mobilePermissions = new Map();
  let sessionCache = new Map();
  let httpServer = null;
  let wss = null;
  let activePort = null;
  let pollTimer = null;
  let heartbeatTimer = null;
  let closed = false;

  // ── HTTP server (serves PWA + WebSocket upgrade) ──

  function serveStatic(req, res) {
    let urlPath;
    try { urlPath = new URL(req.url, "http://localhost").pathname; } catch { res.writeHead(400); res.end(); return; }
    if (urlPath === "/mobile/" || urlPath === "/mobile") urlPath = "/mobile/index.html";
    if (!urlPath.startsWith("/mobile/")) { res.writeHead(404); res.end(); return; }
    const rel = urlPath.slice("/mobile/".length);
    const filePath = path.join(PWA_DIR, rel);
    if (!filePath.startsWith(PWA_DIR)) { res.writeHead(403); res.end(); return; }
    const ext = path.extname(filePath).toLowerCase();
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
      });
      res.end(data);
    });
  }

  httpServer = http.createServer(serveStatic);

  // ── WebSocket server ──

  wss = new WebSocket.Server({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    if (closed) { ws.close(1001, "Server shutting down"); return; }

    let url;
    try { url = new URL(req.url, "http://localhost"); } catch { ws.close(1008, "Bad request"); return; }
    if (url.searchParams.get("token") !== token) {
      ws.close(1008, "Invalid token");
      return;
    }
    if (clients.size >= MAX_CLIENTS) {
      ws.close(1013, "Server busy");
      return;
    }

    clients.add(ws);
    const clientId = crypto.randomBytes(8).toString("hex");
    const clientIp = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
    clientMeta.set(ws, { messageCount: 0, windowStart: Date.now(), clientId, ip: clientIp, lastPong: Date.now() });

    // Send snapshot on connect
    try {
      const snapshot = {};
      for (const [sid, data] of sessionCache) snapshot[sid] = data;
      ws.send(buildMessage("snapshot", { sessions: snapshot }));
    } catch {}

    startHeartbeat();
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
      const meta = clientMeta.get(ws);
      if (meta) meta.lastPong = Date.now();
    });

    ws.on("message", (data) => {
      if (closed) return;
      const meta = clientMeta.get(ws);
      if (!meta) return;
      const now = Date.now();
      if (now - meta.windowStart > RATE_WINDOW_MS) { meta.messageCount = 0; meta.windowStart = now; }
      if (++meta.messageCount > RATE_MAX) { ws.close(1008, "Rate limit"); return; }
      try {
        const msg = JSON.parse(data);
        handleClientMessage(ws, msg);
      } catch {}
    });

    ws.on("close", () => {
      clients.delete(ws);
      clientMeta.delete(ws);
      if (clients.size === 0) stopHeartbeat();
    });
    ws.on("error", () => { clients.delete(ws); clientMeta.delete(ws); });
  });

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const c of clients) {
        const meta = clientMeta.get(c);
        if (c.isAlive === false || (meta && now - meta.lastPong > CLIENT_TIMEOUT_MS)) {
          c.terminate();
          clients.delete(c);
          clientMeta.delete(c);
          continue;
        }
        c.isAlive = false;
        try { c.ping(); } catch {}
      }
      if (clients.size === 0) stopHeartbeat();
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function broadcast(message) {
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) {
        try { c.send(message); } catch {}
      }
    }
  }

  // ── Permission events ──

  function onPermissionBroadcast() {
    const pp = ctx.getPendingPermissions();
    for (let i = 0; i < pp.length; i++) {
      const entry = pp[i];
      if (!entry || entry.isCodexNotify || entry.isKimiNotify) continue;
      const key = String(entry.createdAt || i);
      if (mobilePermissions.has(key)) continue;
      const requestId = "perm_" + key;
      mobilePermissions.set(key, { requestId, entry });
      const session = ctx.sessions.get(entry.sessionId);
      const sessionFolder = session && session.cwd ? path.basename(session.cwd) : null;
      const summary = entry.toolInput && typeof entry.toolInput === "object"
        ? (entry.toolInput.description || entry.toolInput.summary || entry.toolInput.reason || null)
        : null;
      const isElicitation = !!entry.isElicitation;
      broadcast(buildMessage(
        isElicitation ? "elicitation_request" : "permission_request",
        {
          requestId,
          data: {
            agentId: entry.agentId || "claude-code",
            toolName: entry.toolName,
            toolInputSummary: summary,
            suggestions: entry.suggestions || [],
            sessionFolder,
            sessionShortId: entry.sessionId ? String(entry.sessionId).slice(-3) : null,
            ...(isElicitation && entry.toolInput ? { prompt: entry.toolInput.prompt || "", options: entry.toolInput.options || [] } : {}),
            timeout: 90000,
          },
        }
      ));
    }
  }

  function onPermissionResolved(permEntry) {
    if (!permEntry) return;
    for (const [key, mp] of mobilePermissions) {
      if (mp.entry === permEntry) {
        mobilePermissions.delete(key);
        broadcast(buildMessage("permission_dismissed", { requestId: mp.requestId }));
        return;
      }
    }
  }

  // ── Client message handler ──

  function findMobilePermission(requestId) {
    for (const [key, mp] of mobilePermissions) {
      if (mp.requestId === requestId) return key;
    }
    return null;
  }

  function handleClientMessage(ws, msg) {
    if (!msg || typeof msg !== "object") return;
    const { type, requestId } = msg;
    if (!requestId) return;

    if (type === "permission_response" || type === "elicitation_response") {
      const key = findMobilePermission(requestId);
      if (key === null) return;
      const mp = mobilePermissions.get(key);
      // Don't delete here — onPermissionResolved callback handles cleanup
      // (same as desktop bubble and Telegram flows)
      if (typeof ctx.resolvePermissionEntry !== "function") return;

      if (type === "elicitation_response" && msg.answers) {
        mp.entry.resolvedUpdatedInput = buildElicitationUpdatedInput(mp.entry.toolInput, msg.answers);
        ctx.resolvePermissionEntry(mp.entry, "allow", "Mobile elicitation response");
      } else {
        ctx.resolvePermissionEntry(mp.entry, msg.behavior === "allow" ? "allow" : "deny", "Mobile response");
      }
    }
  }

  function buildElicitationUpdatedInput(toolInput, answers) {
    const input = toolInput && typeof toolInput === "object" ? toolInput : {};
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const normalizedAnswers = {};
    for (const q of questions) {
      if (!q || typeof q.question !== "string" || !q.question) continue;
      const answer = answers && Object.prototype.hasOwnProperty.call(answers, q.question) ? answers[q.question] : undefined;
      if (typeof answer === "string" && answer.trim()) normalizedAnswers[q.question] = answer.trim();
    }
    return { ...input, questions, answers: normalizedAnswers };
  }

  // ── Session data ──

  function buildPayload(sid, session) {
    if (!session) return null;
    const recentEvents = Array.isArray(session.recentEvents) ? session.recentEvents : [];
    return {
      sessionId: sid,
      state: session.state || "idle",
      agentId: session.agentId || null,
      cwd: session.cwd || "",
      sessionTitle: session.sessionTitle || null,
      updatedAt: session.updatedAt || Date.now(),
      recentEvents: recentEvents.slice(-20),
      isReal: !!(session.state && session.state !== "idle"),
    };
  }

  function broadcastState(sid, data) {
    broadcast(buildMessage("state", { sessionId: sid, data }));
  }

  // ── Session polling (detects state changes + deletions) ──

  function pollSessions() {
    if (closed) return;
    const upstream = ctx.sessions;
    if (!upstream) return;

    // First poll: populate cache silently
    if (sessionCache.size === 0 && upstream.size > 0) {
      for (const [sid, session] of upstream) {
        const payload = buildPayload(sid, session);
        if (payload) sessionCache.set(sid, payload);
      }
      return;
    }

    // Detect new/changed sessions
    for (const [sid, session] of upstream) {
      const payload = buildPayload(sid, session);
      if (!payload) continue;
      const cached = sessionCache.get(sid);
      if (!cached || cached.updatedAt !== payload.updatedAt || cached.state !== payload.state) {
        sessionCache.set(sid, payload);
        broadcastState(sid, payload);
      }
    }

    // Detect deleted sessions
    for (const sid of sessionCache.keys()) {
      if (!upstream.has(sid)) {
        sessionCache.delete(sid);
        broadcast(buildMessage("session_deleted", { sessionId: sid }));
      }
    }
  }

  // ── Public API ──

  function start() {
    closed = false;
    const ports = [];
    for (let i = 0; i < PORT_RANGE; i++) ports.push(DEFAULT_PORT + i);
    let idx = 0;

    httpServer.on("error", (err) => {
      if (err.code === "EADDRINUSE" && idx < ports.length - 1) {
        idx++;
        httpServer.listen(ports[idx], "0.0.0.0");
        return;
      }
      console.error("[lan-ws] Server error:", err.message);
    });

    httpServer.on("listening", () => {
      activePort = ports[idx];
      console.log(`[lan-ws] LAN bridge listening on 0.0.0.0:${activePort}`);
      console.log(`[lan-ws] Token: ${token}`);
    });

    httpServer.listen(ports[0], "0.0.0.0");
    pollTimer = setInterval(pollSessions, SESSION_POLL_MS);
  }

  function cleanup() {
    closed = true;
    mobilePermissions.clear();
    sessionCache.clear();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    stopHeartbeat();
    for (const c of clients) { try { c.close(1001, "Server shutting down"); } catch {} }
    clients.clear();
    clientMeta.clear();
    if (wss) { try { wss.close(); } catch {} }
    if (httpServer) { try { httpServer.close(); } catch {} }
  }

  return {
    start,
    cleanup,
    onPermissionBroadcast,
    onPermissionResolved,
    getPort: () => activePort,
    getToken: () => token,
    PROTOCOL_VERSION,
  };
}

module.exports = { initLanWsServer, PROTOCOL_VERSION };
