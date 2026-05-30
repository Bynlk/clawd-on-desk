(function() {
  "use strict";

  // === Constants ===

  var STATE_CONFIG = {
    error:        { icon: "error",        color: "#ef4444", priority: 0, label: "错误" },
    attention:    { icon: "attention",    color: "#b45309", priority: 1, label: "需要关注" },
    working:      { icon: "working",      color: "#22c55e", priority: 2, label: "工作中" },
    juggling:     { icon: "juggling",     color: "#22c55e", priority: 2, label: "多任务" },
    thinking:     { icon: "thinking",     color: "#3b82f6", priority: 3, label: "思考中" },
    notification: { icon: "notification", color: "#d97757", priority: 4, label: "通知" },
    sweeping:     { icon: "sweeping",     color: "#71717a", priority: 5, label: "清理中" },
    carrying:     { icon: "carrying",     color: "#71717a", priority: 5, label: "搬运中" },
    idle:         { icon: "idle",         color: "#71717a", priority: 6, label: "空闲" },
    sleeping:     { icon: "sleeping",     color: "#a1a1aa", priority: 7, label: "休眠" },
  };

  var CONNECTION_STATES = {
    connected:    { dot: "connected", text: "已连接", color: "#22c55e" },
    connecting:   { dot: "connecting", text: "连接中...", color: "#b45309" },
    reconnecting: { dot: "reconnecting", text: "重连中...", color: "#ef4444" },
    disconnected: { dot: "", text: "", color: "#52525b" },
    auth_failed:  { dot: "", text: "认证失败", color: "#ef4444" },
  };

  var EVENT_LABELS_CN = {
    UserPromptSubmit: "用户输入", PreToolUse: "工具启动", PostToolUse: "工具完成",
    PostToolUseFailure: "工具失败", Stop: "已完成", SessionStart: "会话开始",
    SessionEnd: "会话结束", PermissionRequest: "需要权限", Notification: "通知",
    SubagentStart: "子代理启动", SubagentStop: "子代理停止",
  };

  var SETTINGS_SECTIONS = [
    { key: "general", label: "通用", fields: [
      { key: "lang", label: "语言" },
      { key: "showTray", label: "显示托盘图标", type: "boolean" },
      { key: "showDock", label: "显示 Dock 图标", type: "boolean" },
      { key: "openAtLogin", label: "开机自启", type: "boolean" },
      { key: "bubbleFollowPet", label: "气泡跟随宠物", type: "boolean" },
    ]},
    { key: "session", label: "会话", fields: [
      { key: "sessionHudEnabled", label: "会话 HUD", type: "boolean" },
      { key: "sessionHudShowStateLabels", label: "显示状态标签", type: "boolean" },
      { key: "sessionHudShowElapsed", label: "显示经过时间", type: "boolean" },
      { key: "sessionHudCleanupDetached", label: "清理已断开会话", type: "boolean" },
    ]},
    { key: "bubbles", label: "气泡 & 通知", fields: [
      { key: "permissionBubblesEnabled", label: "权限气泡", type: "boolean" },
      { key: "soundMuted", label: "静音", type: "boolean" },
      { key: "soundVolume", label: "音量", type: "range" },
    ]},
    { key: "visual", label: "视觉", fields: [
      { key: "theme", label: "主题" },
      { key: "flashTaskbarOnComplete", label: "完成时闪烁任务栏", type: "boolean" },
      { key: "lowPowerIdleMode", label: "低功耗空闲模式", type: "boolean" },
    ]},
    { key: "agents", label: "代理", fields: [] },
  ];

  var MAX_HISTORY = 5;
  var MAX_LOG_LINES = 200;
  var _logBuffer = [];

  // === Utilities ===

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function icon(name) {
    return (typeof ICONS !== "undefined" && ICONS[name]) || "";
  }

  function shortPath(p) {
    if (!p) return "";
    var parts = p.split(/[/\\]/);
    return parts.length > 3 ? ".../" + parts.slice(-2).join("/") : p;
  }

  function formatAgo(ts) {
    if (!ts) return "";
    var sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 5) return "刚刚";
    if (sec < 60) return sec + "秒前";
    if (sec < 3600) return Math.floor(sec / 60) + "分钟前";
    return Math.floor(sec / 3600) + "小时前";
  }

  function eventLabel(eventName) {
    return EVENT_LABELS_CN[eventName] || (typeof EVENT_LABELS !== "undefined" && EVENT_LABELS[eventName]) || eventName || "";
  }

  function log(msg) {
    var now = new Date();
    var ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(function(n) { return String(n).padStart(2, "0"); }).join(":");
    var line = "[" + ts + "] " + msg;
    _logBuffer.push(line);
    if (_logBuffer.length > MAX_LOG_LINES) _logBuffer.shift();
    var el = document.getElementById("settings-log-content");
    if (el) {
      var div = document.createElement("div");
      div.textContent = line;
      el.appendChild(div);
      el.scrollTop = el.scrollHeight;
    }
  }

  function showToast(message, type) {
    type = type || "info";
    var container = document.getElementById("toast-container");
    var toast = document.createElement("div");
    toast.className = "toast " + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }

  // === NotificationManager ===

  class NotificationManager {
    constructor() { this.permission = "default"; this.lastStates = new Map(); }

    requestPermission() {
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") { this.permission = "granted"; return; }
      if (Notification.permission !== "denied") {
        var self = this;
        Notification.requestPermission().then(function(p) { self.permission = p; });
      }
    }

    onStateChange(sessionId, data) {
      if (this.permission !== "granted" || document.visibilityState === "visible") return;
      var prev = this.lastStates.get(sessionId);
      this.lastStates.set(sessionId, data.state);
      var s = data.state;
      var config = STATE_CONFIG[s];
      if (!config) return;
      if (s === "error" || s === "attention") {
        this._notify(config.label, (data.agentId || "Agent") + " - " + config.label, s);
      } else if ((prev === "working" || prev === "thinking") && s === "idle") {
        this._notify("任务完成", (data.agentId || "Agent") + " 已完成任务", "idle");
      }
    }

    onApprovalNeeded(data) {
      if (this.permission !== "granted" || document.visibilityState === "visible") return;
      this._notify("需要操作", (data.agentId || "Agent") + " 请求权限", "notification");
    }

    _notify(title, body, tag) {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(function(reg) {
            reg.showNotification(title, { body: body, tag: "clawd-" + (tag || "default"), icon: "/mobile/icon-192.png" });
          });
        } else {
          new Notification(title, { body: body, tag: "clawd-" + (tag || "default") });
        }
      } catch {}
    }
  }

  // === ApprovalManager ===

  class ApprovalManager {
    constructor() {
      this.pending = new Map();
      this.overlay = document.getElementById("approval-overlay");
      this.onSend = null;
    }

    showRequest(msg) {
      if (!msg.requestId) return;
      this.pending.set(msg.requestId, msg);
      this._render();
      log("Approval: " + (msg.data ? msg.data.toolName || msg.data.prompt || "?" : "?"));
    }

    dismiss(requestId) { this.pending.delete(requestId); this._render(); }

    _render() {
      if (this.pending.size === 0) {
        this.overlay.classList.add("hidden");
        this.overlay.innerHTML = "";
        return;
      }
      var self = this;
      var html = '<div class="approval-sheet">';
      this.pending.forEach(function(msg, requestId) {
        var data = msg.data || {};
        var isPerm = msg.type === "permission_request";
        html += '<div class="approval-card">';
        html += '<div class="approval-header"><span class="approval-icon">' + icon("shield") + '</span>';
        html += '<span class="approval-agent">' + esc(data.agentId || "Agent") + '</span>';
        html += '<span class="approval-type">' + (isPerm ? "权限请求" : "选择操作") + '</span></div>';
        if (isPerm) {
          if (data.toolName) html += '<div class="approval-tool">' + icon("tool") + ' ' + esc(data.toolName) + '</div>';
          if (data.toolInputSummary) html += '<div class="approval-summary">' + esc(data.toolInputSummary) + '</div>';
          html += '<div class="approval-actions">';
          if (data.suggestions && data.suggestions.length > 0) {
            for (var i = 0; i < data.suggestions.length; i++) {
              var sug = data.suggestions[i];
              var cls = sug.behavior === "allow" ? "allow" : sug.behavior === "deny" ? "deny" : "neutral";
              html += '<button class="approval-btn ' + cls + '" data-request="' + requestId + '" data-behavior="' + esc(sug.behavior || "") + '" data-index="' + i + '">' + esc(sug.label || sug.behavior || "选择") + '</button>';
            }
          } else {
            html += '<button class="approval-btn allow" data-request="' + requestId + '" data-behavior="allow">允许</button>';
            html += '<button class="approval-btn deny" data-request="' + requestId + '" data-behavior="deny">拒绝</button>';
          }
          html += '</div>';
        } else {
          if (data.prompt) html += '<div class="approval-summary">' + esc(data.prompt) + '</div>';
          html += '<div class="approval-actions">';
          if (data.options) for (var j = 0; j < data.options.length; j++) {
            var opt = data.options[j];
            html += '<button class="approval-btn neutral" data-request="' + requestId + '" data-elicitation="true" data-value="' + esc(opt.value || "") + '">' + esc(opt.label || opt.value || "选择") + '</button>';
          }
          html += '</div>';
        }
        html += '<div class="approval-timer"><div class="approval-timer-bar" style="animation-duration:' + (data.timeout || 90000) + 'ms"></div></div>';
        html += '</div>';
      });
      html += '</div>';
      this.overlay.innerHTML = html;
      this.overlay.classList.remove("hidden");
      this.overlay.querySelectorAll(".approval-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var rid = this.getAttribute("data-request");
          var behavior = this.getAttribute("data-behavior");
          if (this.getAttribute("data-elicitation") === "true") {
            if (self.onSend) self.onSend({ type: "elicitation_response", requestId: rid, answers: { value: this.getAttribute("data-value") } });
          } else {
            var idx = this.getAttribute("data-index");
            var payload = { type: "permission_response", requestId: rid, behavior: behavior };
            if (idx !== null && idx !== "") payload.suggestionIndex = parseInt(idx, 10);
            if (self.onSend) self.onSend(payload);
          }
          self.dismiss(rid);
        });
      });
    }
  }

  // === ConnectionManager ===

  class ConnectionManager {
    constructor() {
      this.ws = null; this.config = null;
      this.reconnectDelay = 1000; this.maxReconnectDelay = 30000;
      this.reconnectTimer = null; this.state = "disconnected";
      this.onStateChange = null; this.onMessage = null; this.onDisconnected = null;
    }

    connect(config) {
      this.config = config;
      this._saveToHistory(config);
      this._doConnect();
    }

    _doConnect() {
      if (this.ws) { try { this.ws.close(); } catch {} }
      var url = "ws://" + this.config.host + ":" + this.config.port + "/ws?token=" + this.config.token;
      this._setState("connecting");
      log("Connecting to " + this.config.host + ":" + this.config.port + "...");
      try { this.ws = new WebSocket(url); } catch (err) { log("WS create failed: " + err.message); this._scheduleReconnect(); return; }
      var self = this;
      this.ws.onopen = function() { self.reconnectDelay = 1000; self._setState("connected"); log("Connected"); showToast("已连接到桌面端", "success"); };
      this.ws.onmessage = function(event) { try { var msg = JSON.parse(event.data); if (self.onMessage) self.onMessage(msg); } catch {} };
      this.ws.onclose = function(event) {
        if (event.code === 1008) { self._setState("auth_failed"); log("Auth failed"); showToast("认证失败", "error"); return; }
        if (self.state === "connected") log("Disconnected (code: " + event.code + ")");
        if (self.onDisconnected) self.onDisconnected();
        self._scheduleReconnect();
      };
      this.ws.onerror = function() {};
    }

    send(data) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(typeof data === "string" ? data : JSON.stringify(data)); }

    _scheduleReconnect() {
      this._setState("reconnecting");
      var self = this;
      this.reconnectTimer = setTimeout(function() { self.reconnectDelay = Math.min(self.reconnectDelay * 2, self.maxReconnectDelay); self._doConnect(); }, this.reconnectDelay);
    }

    disconnect() {
      clearTimeout(this.reconnectTimer);
      if (this.ws) { try { this.ws.close(1000, "User disconnect"); } catch {} }
      this.ws = null; this._setState("disconnected"); log("Disconnected by user");
    }

    _setState(state) { this.state = state; if (this.onStateChange) this.onStateChange(state); }

    _saveToHistory(config) {
      var history = []; try { history = JSON.parse(localStorage.getItem("clawd-history") || "[]"); } catch {}
      var entry = { host: config.host, port: config.port, token: config.token, timestamp: Date.now() };
      var filtered = history.filter(function(h) { return h.host !== config.host || h.port !== config.port; });
      filtered.unshift(entry);
      localStorage.setItem("clawd-history", JSON.stringify(filtered.slice(0, MAX_HISTORY)));
    }

    getHistory() { try { return JSON.parse(localStorage.getItem("clawd-history") || "[]"); } catch { return []; } }
    deleteHistory(index) { var h = this.getHistory(); h.splice(index, 1); localStorage.setItem("clawd-history", JSON.stringify(h)); }
  }

  // === SessionRenderer ===

  class SessionRenderer {
    constructor(container) { this.container = container; this.sessions = new Map(); this.staleTimer = null; this.expandedSet = new Set(); }

    updateFromSnapshot(sessions) {
      this.sessions.clear();
      for (var sid in sessions) { if (sessions.hasOwnProperty(sid)) this.sessions.set(sid, sessions[sid]); }
      this.render();
    }

    updateState(sessionId, data) {
      var existing = this.sessions.get(sessionId) || {};
      var merged = {}; for (var k in existing) { if (existing.hasOwnProperty(k)) merged[k] = existing[k]; }
      for (var k2 in data) { if (data.hasOwnProperty(k2)) merged[k2] = data[k2]; }
      merged.updatedAt = Date.now();
      this.sessions.set(sessionId, merged);
      this.render();
    }

    removeSession(sessionId) { this.sessions.delete(sessionId); this.expandedSet.delete(sessionId); this.render(); }
    toggleExpand(sid) { if (this.expandedSet.has(sid)) this.expandedSet.delete(sid); else this.expandedSet.add(sid); this.render(); }

    render() {
      var self = this;
      var entries = [];
      this.sessions.forEach(function(v, k) { entries.push([k, v]); });
      entries.sort(function(a, b) {
        var pa = (STATE_CONFIG[a[1].state] || STATE_CONFIG.idle).priority;
        var pb = (STATE_CONFIG[b[1].state] || STATE_CONFIG.idle).priority;
        if (pa !== pb) return pa - pb;
        return (b[1].updatedAt || 0) - (a[1].updatedAt || 0);
      });

      if (entries.length === 0) {
        this.container.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icon("paw") + '</div>' +
          '<div class="empty-text">连接桌面端开始监控</div>' +
          '<div class="empty-hint">前往设置页配置连接</div></div>';
        return;
      }

      var html = '<div class="section-label">活跃会话 &middot; ' + entries.length + '</div>';
      for (var i = 0; i < entries.length; i++) html += this._renderCard(entries[i][0], entries[i][1]);
      this.container.innerHTML = html;
      this.container.querySelectorAll(".card-footer").forEach(function(el) {
        el.addEventListener("click", function() { self.toggleExpand(this.getAttribute("data-sid")); });
      });
    }

    _renderCard(sid, s) {
      var config = STATE_CONFIG[s.state] || STATE_CONFIG.idle;
      var isExpanded = this.expandedSet.has(sid);
      var events = s.recentEvents || [];
      var stateKey = s.state || "idle";
      var html = '<div class="session-card">';
      html += '<div class="card-header"><div class="card-agent"><div class="agent-dot"></div>';
      html += '<span class="agent-name">' + esc((s.agentId || "agent").toUpperCase()) + '</span></div>';
      html += '<span class="state-badge ' + stateKey + '">' + config.label + '</span></div>';
      html += '<div class="card-title">' + esc(s.sessionTitle || s.agentId || "") + '</div>';
      html += '<div class="card-meta">';
      if (s.agentId) html += '<span class="meta-item">' + icon("tool") + '<span>Agent</span></span>';
      if (s.cwd) { html += '<div class="meta-divider"></div>'; html += '<span class="meta-item mono">' + icon("folder") + '<span>' + esc(shortPath(s.cwd)) + '</span></span>'; }
      html += '</div>';
      if (s.lastOutput && s.lastOutput.output) html += '<div class="card-output">' + esc(s.lastOutput.output) + '</div>';
      html += '<div class="card-divider"></div>';
      html += '<div class="card-footer" data-sid="' + sid + '"><div class="footer-events">' + icon("activity") + '<span>最近事件</span>';
      if (events.length) html += '<span class="event-count">' + events.length + '</span>';
      html += '</div><span class="footer-chevron">' + (isExpanded ? icon("collapse") : icon("expand")) + '</span></div>';
      if (isExpanded && events.length) html += this._renderEvents(events);
      html += '</div>';
      return html;
    }

    _renderEvents(events) {
      var html = '<div class="event-history">';
      for (var i = 0; i < events.length; i++) {
        var ev = events[i]; var c = STATE_CONFIG[ev.state] || STATE_CONFIG.idle;
        html += '<div class="event-row"><div class="event-dot" style="background:' + c.color + '"></div>';
        html += '<div class="event-line" style="background:' + c.color + '"></div>';
        html += '<span class="event-label">' + esc(eventLabel(ev.event)) + '</span>';
        html += '<span class="event-time">' + formatAgo(ev.at) + '</span></div>';
      }
      return html + '</div>';
    }

    startStaleCleanup() {
      var self = this;
      this.staleTimer = setInterval(function() {
        var now = Date.now(); var changed = false;
        self.sessions.forEach(function(s, sid) {
          var age = now - (s.updatedAt || 0);
          if ((s.state === "sleeping" && age > 30000) || age > 600000) { self.sessions.delete(sid); changed = true; }
        });
        if (changed) self.render();
      }, 15000);
    }
  }

  // === SettingsRenderer ===

  class SettingsRenderer {
    constructor(container) { this.container = container; this.pcSettings = null; }

    render(connection, onConnect, onDisconnect) {
      var self = this;
      var html = '';

      // Connection section
      html += '<div class="settings-section">';
      html += '<div class="settings-section-title">连接</div>';
      var st = connection.state;
      var stCfg = CONNECTION_STATES[st] || CONNECTION_STATES.disconnected;
      html += '<div class="conn-status">';
      html += '<span class="conn-status-dot ' + stCfg.dot + '"></span>';
      html += '<span class="conn-status-text">' + stCfg.text + '</span>';
      if (connection.config) html += '<span class="conn-status-addr">' + esc(connection.config.host) + ':' + connection.config.port + '</span>';
      html += '</div>';
      html += '<div class="input-group"><label>地址</label><input id="input-host" type="text" placeholder="192.168.1.10" autocomplete="off" value="' + esc((connection.config && connection.config.host) || "") + '"></div>';
      html += '<div class="input-group"><label>端口</label><input id="input-port" type="number" placeholder="23334" value="' + esc(String((connection.config && connection.config.port) || "23334")) + '"></div>';
      html += '<div class="input-group"><label>Token</label><input id="input-token" type="text" placeholder="32位token" autocomplete="off" value="' + esc((connection.config && connection.config.token) || "") + '"></div>';
      html += '<div class="btn-group"><button id="btn-connect" class="primary-btn">连接</button><button id="btn-disconnect" class="secondary-btn">断开</button></div>';
      var history = connection.getHistory();
      if (history.length > 0) {
        html += '<div class="history-list">';
        for (var i = 0; i < history.length; i++) {
          var h = history[i];
          html += '<div class="history-item"><span class="history-addr">' + esc(h.host) + ':' + h.port + '</span><span class="history-time">' + formatAgo(h.timestamp) + '</span><button class="history-connect" data-index="' + i + '">连接</button><button class="history-delete" data-index="' + i + '">&times;</button></div>';
        }
        html += '</div>';
      }
      html += '</div>';

      // PC端 Settings (read-only)
      if (this.pcSettings) {
        for (var si = 0; si < SETTINGS_SECTIONS.length; si++) {
          var section = SETTINGS_SECTIONS[si];
          html += '<div class="settings-section"><div class="settings-section-title">' + esc(section.label) + '</div>';
          if (section.key === "agents" && this.pcSettings.agents) {
            for (var agentId in this.pcSettings.agents) {
              if (!this.pcSettings.agents.hasOwnProperty(agentId)) continue;
              html += '<div class="settings-row"><span class="settings-label">' + esc(agentId) + '</span><span class="settings-value">' + (this.pcSettings.agents[agentId].enabled ? '✓' : '✗') + '</span></div>';
            }
          } else {
            for (var fi = 0; fi < section.fields.length; fi++) {
              var field = section.fields[fi];
              var val = this.pcSettings[field.key];
              html += '<div class="settings-row"><span class="settings-label">' + esc(field.label) + '</span><span class="settings-value">' + esc(formatSettingsValue(val, field)) + '</span></div>';
            }
          }
          html += '</div>';
        }
      }

      // Log section
      html += '<div class="log-section">';
      html += '<button class="log-toggle" id="btn-toggle-log">日志 (' + _logBuffer.length + ')</button>';
      html += '<div class="log-body" id="settings-log-content"></div>';
      html += '</div>';

      this.container.innerHTML = html;

      // Render buffered log lines
      var logEl = document.getElementById("settings-log-content");
      if (logEl) {
        for (var li = 0; li < _logBuffer.length; li++) {
          var div = document.createElement("div");
          div.textContent = _logBuffer[li];
          logEl.appendChild(div);
        }
        logEl.scrollTop = logEl.scrollHeight;
      }

      // Bind log toggle
      var logToggle = document.getElementById("btn-toggle-log");
      var logBody = document.getElementById("settings-log-content");
      if (logToggle && logBody) {
        logToggle.addEventListener("click", function() {
          logToggle.classList.toggle("open");
          logBody.classList.toggle("open");
        });
      }

      this._bindEvents(connection, onConnect, onDisconnect);
    }

    _bindEvents(connection, onConnect, onDisconnect) {
      var self = this;
      var btnConnect = document.getElementById("btn-connect");
      var btnDisconnect = document.getElementById("btn-disconnect");
      if (btnConnect) btnConnect.addEventListener("click", function() {
        var host = document.getElementById("input-host").value.trim();
        var port = parseInt(document.getElementById("input-port").value, 10);
        var token = document.getElementById("input-token").value.trim();
        if (!host || !port || !token) { showToast("请填写完整连接信息", "error"); return; }
        onConnect({ host: host, port: port, token: token });
      });
      if (btnDisconnect) btnDisconnect.addEventListener("click", function() { onDisconnect(); });

      this.container.querySelectorAll(".history-connect").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var entry = connection.getHistory()[parseInt(this.getAttribute("data-index"), 10)];
          if (entry) onConnect(entry);
        });
      });
      this.container.querySelectorAll(".history-delete").forEach(function(btn) {
        btn.addEventListener("click", function() {
          connection.deleteHistory(parseInt(this.getAttribute("data-index"), 10));
          self.render(connection, onConnect, onDisconnect);
        });
      });
    }

    fetchPcSettings() {
      var self = this;
      var host = window.location.hostname;
      var port = window.location.port;
      fetch("http://" + host + ":" + port + "/api/connection-info")
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.settings) {
            self.pcSettings = data.settings;
            var hostInput = document.getElementById("input-host");
            var portInput = document.getElementById("input-port");
            var tokenInput = document.getElementById("input-token");
            if (hostInput && !hostInput.value && data.lanIp) hostInput.value = data.lanIp;
            if (portInput && !portInput.value && data.port) portInput.value = data.port;
            if (tokenInput && !tokenInput.value && data.token) tokenInput.value = data.token;
          }
        })
        .catch(function() {});
    }
  }

  function formatSettingsValue(val, field) {
    if (val === undefined || val === null) return "—";
    if (field && field.type === "boolean") return val ? "是" : "否";
    if (field && field.type === "range") return String(Math.round(val * 100)) + "%";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  }

  // === App ===

  class App {
    constructor() {
      this.connection = new ConnectionManager();
      this.renderer = new SessionRenderer(document.getElementById("session-list"));
      this.settingsRenderer = new SettingsRenderer(document.getElementById("settings-content"));
      this.approval = new ApprovalManager();
      this.notifier = new NotificationManager();
      this.activeTab = "sessions";

      window._clawdApp = this;

      this._bindNav();
      this._bindConnection();
      this._bindApproval();
      this.renderer.startStaleCleanup();

      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/mobile/sw.js").catch(function() {});
      this._autoConnect();
    }

    _autoConnect() {
      var params = new URLSearchParams(window.location.search);
      var urlHost = params.get("host");
      var urlPort = params.get("port");
      var urlToken = params.get("token");
      if (urlHost && urlPort && urlToken) {
        this.connection.connect({ host: urlHost, port: parseInt(urlPort, 10), token: urlToken });
        return;
      }
      var history = this.connection.getHistory();
      if (history.length > 0) { this.connection.connect(history[0]); return; }
      var bridgeHost = window.location.hostname;
      var bridgePort = window.location.port;
      if (bridgeHost && bridgePort) {
        var self = this;
        fetch("http://" + bridgeHost + ":" + bridgePort + "/api/connection-info")
          .then(function(r) { return r.json(); })
          .then(function(data) { if (data && data.token) self.connection.connect({ host: bridgeHost, port: parseInt(bridgePort, 10), token: data.token }); })
          .catch(function() {});
      }
    }

    _bindNav() {
      var self = this;
      document.querySelectorAll(".nav-tab").forEach(function(tab) {
        tab.addEventListener("click", function() { self._switchTab(this.getAttribute("data-tab")); });
      });
    }

    _switchTab(tabId) {
      this.activeTab = tabId;
      document.querySelectorAll(".nav-tab").forEach(function(t) {
        t.classList.toggle("active", t.getAttribute("data-tab") === tabId);
      });
      document.getElementById("page-sessions").classList.toggle("hidden", tabId !== "sessions");
      document.getElementById("page-settings").classList.toggle("hidden", tabId !== "settings");
      if (tabId === "settings") {
        this._renderSettings();
        this.settingsRenderer.fetchPcSettings();
      }
    }

    _renderSettings() {
      var self = this;
      this.settingsRenderer.render(
        this.connection,
        function(config) { self.connection.connect(config); },
        function() { self.connection.disconnect(); }
      );
    }

    _bindConnection() {
      var self = this;
      this.connection.onStateChange = function(state) {
        self._updateConnectionStatus(state);
        if (state === "connected") self.notifier.requestPermission();
        if (self.activeTab === "settings") self._renderSettings();
      };
      this.connection.onDisconnected = function() { self.approval.pending.clear(); self.approval._render(); };
      this.connection.onMessage = function(msg) {
        if (msg.type === "snapshot") { self.renderer.updateFromSnapshot(msg.sessions || {}); log("Snapshot: " + Object.keys(msg.sessions || {}).length + " sessions"); }
        else if (msg.type === "state") { self.renderer.updateState(msg.sessionId, msg.data); self.notifier.onStateChange(msg.sessionId, msg.data); }
        else if (msg.type === "session_deleted") { self.renderer.removeSession(msg.sessionId); }
        else if (msg.type === "tool_output") { var sid = msg.sessionId; var session = self.renderer.sessions.get(sid); if (session) { session.lastOutput = { toolName: msg.data.toolName, output: (msg.data.output || "").substring(0, 200), at: msg.timestamp || Date.now() }; self.renderer.render(); } }
        else if (msg.type === "permission_request") { self.approval.showRequest({ type: "permission_request", requestId: msg.requestId, data: msg.data || msg }); self.notifier.onApprovalNeeded(msg.data || msg); }
        else if (msg.type === "elicitation_request") { self.approval.showRequest({ type: "elicitation_request", requestId: msg.requestId, data: msg.data || msg }); self.notifier.onApprovalNeeded(msg.data || msg); }
        else if (msg.type === "permission_dismissed" && msg.requestId) { self.approval.dismiss(msg.requestId); }
      };
    }

    _updateConnectionStatus(state) {
      var config = CONNECTION_STATES[state] || CONNECTION_STATES.disconnected;
      var dot = document.getElementById("connection-dot");
      var text = document.getElementById("connection-text");
      dot.className = "connection-dot " + config.dot;
      text.textContent = state === "disconnected" ? "" : config.text;
      text.className = "connection-text" + (state === "connected" ? " connected" : "");
    }

    _bindApproval() {
      var self = this;
      this.approval.onSend = function(response) { self.connection.send(response); log("Sent: " + response.type); };
    }
  }

  // === Init ===
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function() { new App(); });
  else new App();
})();
