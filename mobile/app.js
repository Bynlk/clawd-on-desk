(function() {
  "use strict";

  // === 常量 ===

  var STATE_CONFIG = {
    error:        { icon: "❌", color: "#d63031", priority: 0, label: "错误" },
    attention:    { icon: "⚠️", color: "#e17055", priority: 1, label: "需要关注" },
    working:      { icon: "⚙️", color: "#6c5ce7", priority: 2, label: "工作中" },
    juggling:     { icon: "\u{1F939}", color: "#a29bfe", priority: 2, label: "多任务" },
    thinking:     { icon: "\u{1F914}", color: "#0984e3", priority: 3, label: "思考中" },
    notification: { icon: "\u{1F514}", color: "#00cec9", priority: 4, label: "通知" },
    sweeping:     { icon: "\u{1F9F9}", color: "#636e72", priority: 5, label: "清理中" },
    carrying:     { icon: "\u{1F4E6}", color: "#636e72", priority: 5, label: "搬运中" },
    idle:         { icon: "\u{1F634}", color: "#b2bec3", priority: 6, label: "空闲" },
    sleeping:     { icon: "\u{1F4A4}", color: "#2d3436", priority: 7, label: "休眠" },
  };

  var CONNECTION_STATES = {
    connected:    { dot: "connected", text: "已连接", color: "#00b894" },
    connecting:   { dot: "connecting", text: "连接中...", color: "#fdcb6e" },
    reconnecting: { dot: "reconnecting", text: "重连中...", color: "#e17055" },
    disconnected: { dot: "", text: "未连接", color: "#636e72" },
    auth_failed:  { dot: "", text: "认证失败", color: "#d63031" },
  };

  var STALE_TIMEOUT_MS = 5 * 60 * 1000;
  var MAX_HISTORY = 5;

  // === 工具函数 ===

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
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

  function log(msg) {
    var el = document.getElementById("log-content");
    if (!el) return;
    var line = document.createElement("div");
    var now = new Date();
    var ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(function(n) { return String(n).padStart(2, "0"); }).join(":");
    line.textContent = "[" + ts + "] " + msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  // === Toast ===

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

  // === ConnectionManager ===

  class ConnectionManager {
    constructor() {
      this.ws = null;
      this.config = null;
      this.reconnectDelay = 1000;
      this.maxReconnectDelay = 30000;
      this.reconnectTimer = null;
      this.state = "disconnected";
      this.onStateChange = null;
      this.onMessage = null;
    }

    connect(config) {
      this.config = config;
      this._saveToHistory(config);
      this._doConnect();
    }

    _doConnect() {
      if (this.ws) {
        try { this.ws.close(); } catch {}
      }

      var host = this.config.host;
      var port = this.config.port;
      var token = this.config.token;
      var url = "ws://" + host + ":" + port + "/ws?token=" + token;

      this._setState("connecting");
      log("Connecting to " + host + ":" + port + "...");

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        log("WebSocket create failed: " + err.message);
        this._scheduleReconnect();
        return;
      }

      var self = this;

      this.ws.onopen = function() {
        self.reconnectDelay = 1000;
        self._setState("connected");
        log("Connected");
        showToast("已连接到桌面端", "success");
      };

      this.ws.onmessage = function(event) {
        try {
          var msg = JSON.parse(event.data);
          if (self.onMessage) self.onMessage(msg);
        } catch {}
      };

      this.ws.onclose = function(event) {
        if (event.code === 1008) {
          self._setState("auth_failed");
          log("Auth failed (invalid token)");
          showToast("认证失败，请重新扫码", "error");
          return;
        }
        if (self.state === "connected") {
          log("Disconnected (code: " + event.code + ")");
        }
        self._scheduleReconnect();
      };

      this.ws.onerror = function() {};
    }

    _scheduleReconnect() {
      this._setState("reconnecting");
      var self = this;
      this.reconnectTimer = setTimeout(function() {
        self.reconnectDelay = Math.min(self.reconnectDelay * 2, self.maxReconnectDelay);
        self._doConnect();
      }, this.reconnectDelay);
    }

    disconnect() {
      clearTimeout(this.reconnectTimer);
      if (this.ws) {
        try { this.ws.close(1000, "User disconnect"); } catch {}
      }
      this.ws = null;
      this._setState("disconnected");
      log("Disconnected by user");
    }

    _setState(state) {
      this.state = state;
      if (this.onStateChange) this.onStateChange(state);
    }

    _saveToHistory(config) {
      var history = [];
      try { history = JSON.parse(localStorage.getItem("clawd-history") || "[]"); } catch {}
      var entry = { host: config.host, port: config.port, timestamp: Date.now() };
      var filtered = history.filter(function(h) {
        return h.host !== config.host || h.port !== config.port;
      });
      filtered.unshift(entry);
      localStorage.setItem("clawd-history", JSON.stringify(filtered.slice(0, MAX_HISTORY)));
    }

    getHistory() {
      try { return JSON.parse(localStorage.getItem("clawd-history") || "[]"); }
      catch { return []; }
    }

    deleteHistory(index) {
      var history = this.getHistory();
      history.splice(index, 1);
      localStorage.setItem("clawd-history", JSON.stringify(history));
    }
  }

  // === SessionRenderer ===

  class SessionRenderer {
    constructor(container) {
      this.container = container;
      this.sessions = new Map();
      this.staleTimer = null;
    }

    updateFromSnapshot(sessions) {
      this.sessions.clear();
      for (var sid in sessions) {
        if (sessions.hasOwnProperty(sid)) {
          this.sessions.set(sid, sessions[sid]);
        }
      }
      this.render();
    }

    updateState(sessionId, data) {
      var existing = this.sessions.get(sessionId) || {};
      var merged = {};
      for (var k in existing) { if (existing.hasOwnProperty(k)) merged[k] = existing[k]; }
      for (var k2 in data) { if (data.hasOwnProperty(k2)) merged[k2] = data[k2]; }
      merged.updatedAt = Date.now();
      this.sessions.set(sessionId, merged);
      this.render();
    }

    render() {
      var entries = [];
      this.sessions.forEach(function(v, k) { entries.push([k, v]); });

      entries.sort(function(a, b) {
        var pa = (STATE_CONFIG[a[1].state] || STATE_CONFIG.idle).priority;
        var pb = (STATE_CONFIG[b[1].state] || STATE_CONFIG.idle).priority;
        if (pa !== pb) return pa - pb;
        return (b[1].updatedAt || 0) - (a[1].updatedAt || 0);
      });

      if (entries.length === 0) {
        this.container.innerHTML = '<div class="empty-state" id="empty-state">' +
          '<div class="empty-icon">\u{1F43E}</div>' +
          '<div class="empty-text">扫码配对开始监控</div>' +
          '<button id="btn-scan-empty" class="primary-btn">扫码配对</button>' +
          '</div>';
        return;
      }

      var html = "";
      for (var i = 0; i < entries.length; i++) {
        html += this._renderCard(entries[i][0], entries[i][1]);
      }
      this.container.innerHTML = html;
    }

    _renderCard(sid, s) {
      var config = STATE_CONFIG[s.state] || STATE_CONFIG.idle;
      var ago = formatAgo(s.updatedAt);
      var html = '<div class="session-card" style="border-left: 3px solid ' + config.color + '">';
      html += '<div class="session-header">';
      html += '<span class="state-icon">' + config.icon + '</span>';
      html += '<span class="agent-id">' + esc(s.agentId || "unknown") + '</span>';
      html += '<span class="state-label">' + config.label + '</span>';
      html += '</div>';
      if (s.sessionTitle) {
        html += '<div class="session-title">' + esc(s.sessionTitle) + '</div>';
      }
      if (s.toolName) {
        html += '<div class="tool-info">\u{1F527} ' + esc(s.toolName) + '</div>';
      }
      if (s.cwd) {
        html += '<div class="cwd">\u{1F4C2} ' + esc(shortPath(s.cwd)) + '</div>';
      }
      html += '<div class="session-footer">' + ago + '</div>';
      html += '</div>';
      return html;
    }

    startStaleCleanup() {
      var self = this;
      this.staleTimer = setInterval(function() {
        var now = Date.now();
        var changed = false;
        self.sessions.forEach(function(s, sid) {
          if (s.state === "sleeping" && now - (s.updatedAt || 0) > STALE_TIMEOUT_MS) {
            self.sessions.delete(sid);
            changed = true;
          }
        });
        if (changed) self.render();
      }, 30000);
    }
  }

  // === QrScanner ===

  class QrScanner {
    constructor(videoElement, canvasElement) {
      this.video = videoElement;
      this.canvas = canvasElement;
      this.ctx = canvasElement.getContext("2d", { willReadFrequently: true });
      this.stream = null;
      this.scanning = false;
      this.onResult = null;
      this.onError = null;
    }

    async start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        var err = new Error("此浏览器不支持摄像头访问");
        if (this.onError) this.onError(err);
        throw err;
      }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        this.video.srcObject = this.stream;
        await this.video.play();
        this.scanning = true;
        this._scanFrame();
      } catch (err) {
        var msg = "摄像头访问失败";
        if (err.name === "NotAllowedError") msg = "请允许摄像头权限后重试";
        if (err.name === "NotFoundError") msg = "未找到摄像头设备";
        var error = new Error(msg);
        if (this.onError) this.onError(error);
        throw error;
      }
    }

    stop() {
      this.scanning = false;
      if (this.stream) {
        this.stream.getTracks().forEach(function(t) { t.stop(); });
        this.stream = null;
      }
    }

    _scanFrame() {
      if (!this.scanning) return;
      var self = this;

      if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.ctx.drawImage(this.video, 0, 0);

        var imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        if (typeof jsQR !== "undefined") {
          var code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          if (code && code.data) {
            var parsed = this._parseClawdUrl(code.data);
            if (parsed) {
              this.stop();
              if (this.onResult) this.onResult(parsed);
              return;
            }
          }
        }
      }

      requestAnimationFrame(function() { self._scanFrame(); });
    }

    _parseClawdUrl(data) {
      var match = data.match(/^clawd:\/\/([^:]+):(\d+)\/([a-f0-9]{16,})$/);
      if (match) return { host: match[1], port: parseInt(match[2], 10), token: match[3] };

      try {
        var obj = JSON.parse(data);
        if (obj.host && obj.port && obj.token) {
          return { host: obj.host, port: parseInt(obj.port, 10), token: obj.token };
        }
      } catch {}

      try {
        var url = new URL(data);
        if (url.protocol === "clawd:") {
          return { host: url.hostname, port: parseInt(url.port, 10), token: url.pathname.slice(1) };
        }
      } catch {}

      return null;
    }
  }

  // === App ===

  class App {
    constructor() {
      this.connection = new ConnectionManager();
      this.renderer = new SessionRenderer(document.getElementById("session-list"));
      this.scanner = new QrScanner(
        document.getElementById("qr-video"),
        document.getElementById("qr-canvas")
      );

      this._bindEvents();
      this._bindConnection();
      this.renderer.startStaleCleanup();

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/mobile/sw.js").catch(function() {});
      }
    }

    _bindEvents() {
      var self = this;

      document.getElementById("btn-scan").addEventListener("click", function() { self._openScanner(); });
      document.getElementById("btn-scan-empty").addEventListener("click", function() { self._openScanner(); });
      document.getElementById("btn-cancel-scan").addEventListener("click", function() { self._closeScanner(); });

      document.getElementById("btn-settings").addEventListener("click", function() { self._openSettings(); });
      document.getElementById("btn-close-settings").addEventListener("click", function() { self._closeSettings(); });
      document.getElementById("btn-connect").addEventListener("click", function() { self._manualConnect(); });
      document.getElementById("btn-disconnect").addEventListener("click", function() { self.connection.disconnect(); });

      document.getElementById("btn-toggle-log").addEventListener("click", function() {
        document.getElementById("log-panel").classList.toggle("collapsed");
      });

      this.scanner.onResult = function(info) {
        self._closeScanner();
        self.connection.connect(info);
      };

      this.scanner.onError = function(err) {
        showToast(err.message, "error");
        self._closeScanner();
      };
    }

    _bindConnection() {
      var self = this;

      this.connection.onStateChange = function(state) {
        var config = CONNECTION_STATES[state] || CONNECTION_STATES.disconnected;
        var dot = document.getElementById("status-dot");
        var text = document.getElementById("status-text");
        dot.className = "status-dot " + config.dot;
        text.textContent = config.text;
      };

      this.connection.onMessage = function(msg) {
        if (msg.type === "snapshot") {
          self.renderer.updateFromSnapshot(msg.sessions || {});
          log("Snapshot received: " + Object.keys(msg.sessions || {}).length + " sessions");
        } else if (msg.type === "state") {
          self.renderer.updateState(msg.sessionId, msg.data);
        }
      };
    }

    _openScanner() {
      var overlay = document.getElementById("qr-overlay");
      overlay.classList.remove("hidden");
      this.scanner.start().catch(function(err) {
        showToast(err.message, "error");
        overlay.classList.add("hidden");
      });
    }

    _closeScanner() {
      this.scanner.stop();
      document.getElementById("qr-overlay").classList.add("hidden");
    }

    _openSettings() {
      var panel = document.getElementById("settings-panel");
      panel.classList.remove("hidden");
      this._renderHistory();

      if (this.connection.config) {
        document.getElementById("input-host").value = this.connection.config.host || "";
        document.getElementById("input-port").value = this.connection.config.port || "";
        document.getElementById("input-token").value = this.connection.config.token || "";
      }
    }

    _closeSettings() {
      document.getElementById("settings-panel").classList.add("hidden");
    }

    _manualConnect() {
      var host = document.getElementById("input-host").value.trim();
      var port = parseInt(document.getElementById("input-port").value, 10);
      var token = document.getElementById("input-token").value.trim();

      if (!host || !port || !token) {
        showToast("请填写完整连接信息", "error");
        return;
      }

      this.connection.connect({ host: host, port: port, token: token });
      this._closeSettings();
    }

    _renderHistory() {
      var history = this.connection.getHistory();
      var container = document.getElementById("connection-history");
      if (history.length === 0) {
        container.innerHTML = "";
        return;
      }

      var self = this;
      var html = '<h4 style="margin:16px 0 8px;font-size:14px;color:var(--text-secondary)">连接历史</h4>';
      history.forEach(function(h, i) {
        var ago = formatAgo(h.timestamp);
        html += '<div class="history-item">';
        html += '<span class="history-addr">' + esc(h.host) + ':' + h.port + '</span>';
        html += '<span class="history-time">' + ago + '</span>';
        html += '<button class="history-connect" data-index="' + i + '">连接</button>';
        html += '<button class="history-delete" data-index="' + i + '">×</button>';
        html += '</div>';
      });
      container.innerHTML = html;

      container.querySelectorAll(".history-connect").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var idx = parseInt(this.getAttribute("data-index"), 10);
          var entry = self.connection.getHistory()[idx];
          if (entry) {
            self.connection.connect(entry);
            self._closeSettings();
          }
        });
      });

      container.querySelectorAll(".history-delete").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var idx = parseInt(this.getAttribute("data-index"), 10);
          self.connection.deleteHistory(idx);
          self._renderHistory();
        });
      });
    }
  }

  // === 初始化 ===

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { new App(); });
  } else {
    new App();
  }

})();
