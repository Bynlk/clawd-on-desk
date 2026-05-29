const http = require("http");
const WebSocket = require("ws");
const { MobileWSServer } = require("../src/mobile-ws-server");
const { MobileApprovalClient } = require("../src/mobile-approval-client");

const PORT = 23342;
const TOKEN = "approval-test-token-abcdef12345678";

const httpServer = http.createServer();
const mobileWS = new MobileWSServer(httpServer, { token: TOKEN });
const approvalClient = new MobileApprovalClient(() => mobileWS);

httpServer.listen(PORT, "127.0.0.1", async () => {
  let passed = 0, failed = 0;
  function assert(cond, name) {
    if (cond) { console.log("  PASS:", name); passed++; }
    else { console.error("  FAIL:", name); failed++; }
  }

  // Helper: wait for WS close
  function waitForClose(ws) {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) return resolve();
      ws.on("close", resolve);
    });
  }

  // Test 1+2: Client receives permission_request and sends permission_response
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}`);
    ws.on("open", () => {
      ws.on("message", (data) => {
        const msg = JSON.parse(data);
        if (msg.type === "permission_request") {
          assert(msg.requestId.startsWith("perm_"), "Has requestId");
          assert(msg.data.toolName === "Bash", "Correct toolName");
          assert(msg.data.suggestions.length > 0, "Has suggestions");

          ws.send(JSON.stringify({
            type: "permission_response",
            requestId: msg.requestId,
            behavior: "allow",
          }));
        }
      });

      approvalClient.requestApproval({
        agentId: "claude-code",
        toolName: "Bash",
        detail: "npm test",
        suggestions: [{ label: "Allow", behavior: "allow" }],
      }).then((result) => {
        assert(result === "allow", "Approval resolved as allow");
        ws.close();
        waitForClose(ws).then(resolve);
      }).catch(reject);
    });
  });

  // Wait for server to register the disconnect
  await new Promise((r) => setTimeout(r, 100));

  // Test 3: Returns null when no clients
  assert(mobileWS.getClientCount() === 0, "No clients connected");
  const result = await approvalClient.requestApproval({
    agentId: "claude-code",
    toolName: "Bash",
    detail: "test",
  });
  assert(result === null, "Returns null when no clients");

  // Test 4: getClientInfoList
  const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}`);
  await new Promise((resolve) => ws2.on("open", resolve));
  const list = mobileWS.getClientInfoList();
  assert(list.length === 1, "getClientInfoList returns 1 client");
  assert(typeof list[0].id === "string", "Client has id");
  assert(typeof list[0].ip === "string", "Client has ip");
  assert(typeof list[0].connectedAt === "number", "Client has connectedAt");

  // Test 5: disconnectClient
  const disconnected = mobileWS.disconnectClient(list[0].id);
  assert(disconnected === true, "disconnectClient returns true");
  await waitForClose(ws2);
  await new Promise((r) => setTimeout(r, 50));
  assert(mobileWS.getClientCount() === 0, "Client count is 0 after disconnect");

  // Test 6: broadcast
  const ws3 = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${TOKEN}`);
  await new Promise((resolve) => ws3.on("open", resolve));
  const broadcastPromise = new Promise((resolve) => {
    ws3.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.type === "test_broadcast") resolve(msg);
    });
  });
  mobileWS.broadcast({ type: "test_broadcast", value: 42 });
  const broadcastMsg = await broadcastPromise;
  assert(broadcastMsg.value === 42, "Broadcast message received");

  // Test 7: onClientMessage / offClientMessage
  let handlerCalled = false;
  const handler = () => { handlerCalled = true; };
  mobileWS.onClientMessage(handler);
  ws3.send(JSON.stringify({ type: "ping" }));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert(handlerCalled === true, "onClientMessage handler called");

  handlerCalled = false;
  mobileWS.offClientMessage(handler);
  ws3.send(JSON.stringify({ type: "ping" }));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert(handlerCalled === false, "offClientMessage handler not called");

  ws3.close();
  await waitForClose(ws3);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  mobileWS.close();
  httpServer.close();
  process.exit(failed > 0 ? 1 : 0);
});
