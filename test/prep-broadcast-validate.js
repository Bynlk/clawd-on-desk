const http = require("http");
const WebSocket = require("ws");
const { MobileWSServer } = require("../src/mobile-ws-server");

const PORT = 23340;
const TOKEN = "broadcast-test-token-1234567890abcdef";

const httpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/state") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        mobileWS.broadcastState(data.session_id || "default", {
          state: data.state,
          event: data.event || "test",
          agentId: "test-agent",
          toolName: null,
          sessionTitle: null,
          cwd: null,
        });
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(400);
        res.end("bad json");
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const mobileWS = new MobileWSServer(httpServer, { token: TOKEN });

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log("[test] Server on port", PORT);
  runTest();
});

async function runTest() {
  let passed = 0;
  let failed = 0;

  function assert(cond, name) {
    if (cond) { console.log("  PASS:", name); passed++; }
    else { console.error("  FAIL:", name); failed++; }
  }

  // Test 1: WS连接后发HTTP POST，验证收到state广播
  await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}`);
    let gotSnapshot = false;

    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.type === "snapshot") {
        gotSnapshot = true;
        const body = JSON.stringify({ state: "thinking", session_id: "test-1", event: "UserPromptSubmit" });
        const req = http.request({
          hostname: "127.0.0.1", port: PORT, path: "/state", method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        });
        req.end(body);
        return;
      }
      if (msg.type === "state" && gotSnapshot) {
        assert(msg.sessionId === "test-1", "Correct sessionId in broadcast");
        assert(msg.data.state === "thinking", "Correct state in broadcast");
        assert(msg.data.agentId === "test-agent", "Correct agentId in broadcast");
        ws.close();
        resolve();
      }
    });
  });

  // Test 2: sessionCache 已更新
  const cache = mobileWS.getSessionCache();
  assert(cache.get("test-1").state === "thinking", "Session cache updated after broadcast");

  // Test 3: 多session广播
  await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}`);
    let gotSnapshot = false;
    let count = 0;

    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.type === "snapshot") {
        gotSnapshot = true;
        // 发送两个不同session的状态更新
        const body1 = JSON.stringify({ state: "working", session_id: "session-a", event: "PreToolUse" });
        const req1 = http.request({
          hostname: "127.0.0.1", port: PORT, path: "/state", method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body1) },
        });
        req1.end(body1);
        const body2 = JSON.stringify({ state: "idle", session_id: "session-b", event: "SessionStart" });
        const req2 = http.request({
          hostname: "127.0.0.1", port: PORT, path: "/state", method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body2) },
        });
        req2.end(body2);
        return;
      }
      if (msg.type === "state" && gotSnapshot) {
        count++;
        if (count === 2) {
          const c = mobileWS.getSessionCache();
          assert(c.get("session-a").state === "working", "Multi-session cache: session-a");
          assert(c.get("session-b").state === "idle", "Multi-session cache: session-b");
          ws.close();
          resolve();
        }
      }
    });
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  mobileWS.close();
  httpServer.close();
  process.exit(failed > 0 ? 1 : 0);
}
