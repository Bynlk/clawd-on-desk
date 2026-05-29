const WebSocket = require("ws");
const crypto = require("crypto");

const DEFAULT_MAX_CLIENTS = 10;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_MESSAGES = 60;

class MobileWSServer {
  constructor(httpServer, options) {
    this.token = options.token;
    this.maxClients = options.maxClients || DEFAULT_MAX_CLIENTS;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || DEFAULT_HEARTBEAT_INTERVAL_MS;

    this.wss = new WebSocket.Server({ server: httpServer, path: "/ws" });
    this.clients = new Set();
    this.sessionCache = new Map();
    this.clientMeta = new Map();
    this._heartbeatTimer = null;
    this._messageHandlers = new Set();

    this.wss.on("connection", (ws, req) => this._handleConnection(ws, req));
  }

  _handleConnection(ws, req) {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (token !== this.token) {
      ws.close(1008, "Invalid token");
      console.log("[mobile-ws] Connection rejected: invalid token");
      return;
    }

    if (this.clients.size >= this.maxClients) {
      ws.close(1013, "Server busy");
      console.log("[mobile-ws] Connection rejected: max clients reached");
      return;
    }

    this.clients.add(ws);
    const clientId = crypto.randomBytes(8).toString("hex");
    const clientIp = req.socket.remoteAddress || "unknown";
    this.clientMeta.set(ws, {
      messageCount: 0,
      windowStart: Date.now(),
      clientId: clientId,
      ip: clientIp,
      connectedAt: Date.now(),
    });
    console.log("[mobile-ws] Client connected (total: " + this.clients.size + ")");

    ws.send(JSON.stringify({
      type: "snapshot",
      sessions: Object.fromEntries(this.sessionCache),
      timestamp: Date.now(),
    }));

    this._startHeartbeat();

    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (data) => {
      const meta = this.clientMeta.get(ws);
      if (!meta) return;
      const now = Date.now();
      if (now - meta.windowStart > RATE_LIMIT_WINDOW_MS) {
        meta.messageCount = 0;
        meta.windowStart = now;
      }
      meta.messageCount++;
      if (meta.messageCount > RATE_LIMIT_MAX_MESSAGES) {
        ws.close(1008, "Rate limit exceeded");
        console.log("[mobile-ws] Connection closed: rate limit exceeded");
        return;
      }

      // Parse client messages and dispatch to handlers
      try {
        const msg = JSON.parse(data);
        for (const handler of this._messageHandlers) {
          try { handler(ws, msg); } catch {}
        }
      } catch {}
    });

    ws.on("close", () => {
      this.clients.delete(ws);
      this.clientMeta.delete(ws);
      console.log("[mobile-ws] Client disconnected (total: " + this.clients.size + ")");
      if (this.clients.size === 0) this._stopHeartbeat();
    });

    ws.on("error", (err) => {
      console.error("[mobile-ws] Client error:", err.message);
      this.clients.delete(ws);
      this.clientMeta.delete(ws);
    });
  }

  _startHeartbeat() {
    if (this._heartbeatTimer) return;
    this._heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        if (client.isAlive === false) {
          client.terminate();
          this.clients.delete(client);
          this.clientMeta.delete(client);
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, this.heartbeatIntervalMs);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  broadcastState(sessionId, stateData) {
    this.sessionCache.set(sessionId, { ...stateData, updatedAt: Date.now() });
    const message = JSON.stringify({
      type: "state",
      sessionId,
      data: stateData,
      timestamp: Date.now(),
    });
    this._broadcast(message);
  }

  broadcastToolOutput(sessionId, toolData) {
    const message = JSON.stringify({
      type: "tool_output",
      sessionId,
      data: toolData,
      timestamp: Date.now(),
    });
    this._broadcast(message);
  }

  getSessionCache() {
    return new Map(this.sessionCache);
  }

  getClientCount() {
    return this.clients.size;
  }

  onClientMessage(handler) {
    this._messageHandlers.add(handler);
  }

  offClientMessage(handler) {
    this._messageHandlers.delete(handler);
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    this._broadcast(message);
  }

  getClientInfoList() {
    const list = [];
    for (const ws of this.clients) {
      const meta = this.clientMeta.get(ws);
      list.push({
        id: meta?.clientId || "unknown",
        ip: meta?.ip || "--",
        connectedAt: meta?.connectedAt || null,
      });
    }
    return list;
  }

  disconnectClient(clientId) {
    for (const ws of this.clients) {
      const meta = this.clientMeta.get(ws);
      if (meta && meta.clientId === clientId) {
        ws.close(1000, "Disconnected by server");
        return true;
      }
    }
    return false;
  }

  close() {
    this._stopHeartbeat();
    for (const client of this.clients) {
      client.close(1001, "Server shutting down");
    }
    this.clients.clear();
    this.clientMeta.clear();
    this.wss.close();
  }

  _broadcast(message) {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}

module.exports = { MobileWSServer };
