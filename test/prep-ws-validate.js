const http = require("http");
const WebSocket = require("ws");
const { MobileWSServer } = require("../src/mobile-ws-server");

const PORT = 23339;
const TOKEN = "test-token-abcdef1234567890abcdef1234567890";

const httpServer = http.createServer();
const mobileWS = new MobileWSServer(httpServer, { token: TOKEN });

httpServer.listen(PORT, async () => {
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) { console.log("  PASS: " + name); passed++; }
    else { console.error("  FAIL: " + name); failed++; }
  }

  // Test 1: 拒绝无 token
  await new Promise((resolve) => {
    const ws = new WebSocket("ws://127.0.0.1:" + PORT + "/ws");
    ws.on("close", (code) => {
      assert(code === 1008, "Reject without token");
      resolve();
    });
  });

  // Test 2: 拒绝错误 token
  await new Promise((resolve) => {
    const ws = new WebSocket("ws://127.0.0.1:" + PORT + "/ws?token=wrong");
    ws.on("close", (code) => {
      assert(code === 1008, "Reject wrong token");
      resolve();
    });
  });

  // Test 3: 接受正确 token
  await new Promise((resolve) => {
    const ws = new WebSocket("ws://127.0.0.1:" + PORT + "/ws?token=" + TOKEN);
    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      assert(msg.type === "snapshot", "Snapshot received");
      assert(typeof msg.timestamp === "number", "Snapshot has timestamp");
      ws.on("close", () => resolve());
      ws.close();
    });
  });

  // Test 4: 广播状态
  await new Promise((resolve) => {
    const ws = new WebSocket("ws://127.0.0.1:" + PORT + "/ws?token=" + TOKEN);
    let snapshotReceived = false;
    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.type === "snapshot") { snapshotReceived = true; return; }
      if (msg.type === "state") {
        assert(snapshotReceived, "State after snapshot");
        assert(msg.sessionId === "test-sid", "Correct sessionId");
        assert(msg.data.state === "working", "Correct state");
        ws.on("close", () => resolve());
        ws.close();
      }
    });
    setTimeout(() => {
      mobileWS.broadcastState("test-sid", { state: "working", event: "PreToolUse" });
    }, 100);
  });

  // Test 5: sessionCache
  const cache = mobileWS.getSessionCache();
  assert(cache.get("test-sid").state === "working", "Session cache updated");

  // Test 6: 客户端计数
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert(mobileWS.getClientCount() === 0, "Client count is 0 after close");

  console.log("\nResults: " + passed + " passed, " + failed + " failed");
  mobileWS.close();
  httpServer.close();
  process.exit(failed > 0 ? 1 : 0);
});
