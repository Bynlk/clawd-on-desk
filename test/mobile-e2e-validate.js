const http = require("http");
const WebSocket = require("ws");
const { MobileWSServer } = require("../src/mobile-ws-server");

const PORT = 23341;
const TOKEN = "e2e-test-token-abcdef1234567890ab";

// 模拟完整的 HTTP 服务器 + MobileWSServer
const httpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/state") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const sid = data.session_id || "default";
        mobileWS.broadcastState(sid, {
          state: data.state,
          event: data.event || "test",
          agentId: data.agentId || "test-agent",
          toolName: data.toolName || null,
          sessionTitle: data.sessionTitle || null,
          cwd: data.cwd || null,
        });
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(400);
        res.end("bad json");
      }
    });
  } else if (req.method === "GET" && req.url === "/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const mobileWS = new MobileWSServer(httpServer, {
  token: TOKEN,
  maxClients: 5,
  heartbeatIntervalMs: 5000, // 快速心跳用于测试
});

httpServer.listen(PORT, "127.0.0.1", async () => {
  console.log("[e2e] Server on port", PORT);
  await runTests();
});

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(cond, name) {
    if (cond) { console.log("  PASS:", name); passed++; }
    else { console.error("  FAIL:", name); failed++; }
  }

  // === Test 1: 完整连接流程 ===
  await test("Full connection flow", async () => {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}`);
      ws.on("message", (data) => {
        const msg = JSON.parse(data);
        assert(msg.type === "snapshot", "1a: Received snapshot");
        assert(typeof msg.timestamp === "number", "1b: Snapshot has timestamp");
        assert(msg.sessions !== undefined, "1c: Snapshot has sessions object");
        ws.close();
        resolve();
      });
    });
  });

  // === Test 2: 状态广播 + sessionCache ===
  await test("State broadcast + session cache", async () => {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}`);
      let gotSnapshot = false;
      ws.on("message", (data) => {
        const msg = JSON.parse(data);
        if (msg.type === "snapshot") { gotSnapshot = true; return; }
        if (msg.type === "state" && gotSnapshot) {
          assert(msg.sessionId === "session-1", "2a: Correct sessionId");
          assert(msg.data.state === "thinking", "2b: Correct state");
          assert(msg.data.agentId === "claude-code", "2c: Correct agentId");
          assert(msg.data.toolName === null, "2d: toolName is null for thinking");

          // 验证 sessionCache
          const cache = mobileWS.getSessionCache();
          assert(cache.get("session-1").state === "thinking", "2e: Session cache updated");
          ws.close();
          resolve();
        }
      });
      setTimeout(() => {
        httpPost("/state", {
          state: "thinking",
          session_id: "session-1",
          event: "UserPromptSubmit",
          agentId: "claude-code",
        });
      }, 100);
    });
  });

  // === Test 3: 多会话 + 优先级 ===
  await test("Multiple sessions", async () => {
    // 先创建多个会话
    await httpPost("/state", { state: "working", session_id: "s1", event: "PreToolUse", agentId: "claude-code", toolName: "Bash" });
    await httpPost("/state", { state: "error", session_id: "s2", event: "PostToolUseFailure", agentId: "codex" });
    await httpPost("/state", { state: "idle", session_id: "s3", event: "SessionStart", agentId: "gemini-cli" });

    const cache = mobileWS.getSessionCache();
    assert(cache.size >= 3, "3a: At least 3 sessions in cache");
    assert(cache.get("s1").state === "working", "3b: s1 is working");
    assert(cache.get("s2").state === "error", "3c: s2 is error");
    assert(cache.get("s3").state === "idle", "3d: s3 is idle");
    assert(cache.get("s1").toolName === "Bash", "3e: s1 toolName is Bash");
  });

  // === Test 4: 新连接收到完整快照 ===
  await test("New connection gets full snapshot", async () => {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}`);
      ws.on("message", (data) => {
        const msg = JSON.parse(data);
        if (msg.type === "snapshot") {
          const sessions = msg.sessions;
          assert(sessions["s1"] !== undefined, "4a: snapshot contains s1");
          assert(sessions["s2"] !== undefined, "4b: snapshot contains s2");
          assert(sessions["s3"] !== undefined, "4c: snapshot contains s3");
          assert(sessions["s1"].toolName === "Bash", "4d: snapshot s1 has toolName");
          ws.close();
          resolve();
        }
      });
    });
  });

  // === Test 5: 广播到多个客户端 ===
  await test("Broadcast to multiple clients", async () => {
    const ws1 = await connect();
    const ws2 = await connect();
    let received1 = false, received2 = false;

    await new Promise((resolve) => {
      ws1.on("message", (data) => {
        const msg = JSON.parse(data);
        if (msg.type === "state" && msg.sessionId === "multi-test") {
          received1 = true;
          if (received2) { ws1.close(); ws2.close(); resolve(); }
        }
      });
      ws2.on("message", (data) => {
        const msg = JSON.parse(data);
        if (msg.type === "state" && msg.sessionId === "multi-test") {
          received2 = true;
          if (received1) { ws1.close(); ws2.close(); resolve(); }
        }
      });
      setTimeout(() => {
        httpPost("/state", { state: "working", session_id: "multi-test", event: "PreToolUse" });
      }, 100);
    });

    assert(received1, "5a: Client 1 received broadcast");
    assert(received2, "5b: Client 2 received broadcast");
  });

  // === Test 6: 错误 token 拒绝 ===
  await test("Token rejection", async () => {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=wrong`);
      ws.on("close", (code) => {
        assert(code === 1008, "6a: Wrong token rejected with 1008");
        resolve();
      });
    });
  });

  // === Test 7: 无 token 拒绝 ===
  await test("No token rejection", async () => {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      ws.on("close", (code) => {
        assert(code === 1008, "7a: No token rejected with 1008");
        resolve();
      });
    });
  });

  // === Test 8: 客户端计数 ===
  await test("Client count", async () => {
    const ws1 = await connect();
    const ws2 = await connect();
    assert(mobileWS.getClientCount() === 2, "8a: 2 clients connected");
    ws1.close();
    await sleep(200);
    assert(mobileWS.getClientCount() === 1, "8b: 1 client after disconnect");
    ws2.close();
    await sleep(200);
    assert(mobileWS.getClientCount() === 0, "8c: 0 clients after all disconnect");
  });

  // === 结果 ===
  console.log(`\n=== E2E Results: ${passed} passed, ${failed} failed ===`);
  mobileWS.close();
  httpServer.close();
  process.exit(failed > 0 ? 1 : 0);
}

// === 辅助函数 ===

async function test(name, fn) {
  console.log(`\n[test] ${name}`);
  try {
    await fn();
  } catch (err) {
    console.error("  FAIL: Exception:", err.message);
  }
}

function connect() {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}`);
    ws.on("message", () => {}); // drain snapshot
    ws.on("open", () => resolve(ws));
  });
}

function httpPost(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: path,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    });
    req.on("response", resolve);
    req.on("error", reject);
    req.end(body);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
