const crypto = require("crypto");

class MobileApprovalClient {
  constructor(getMobileWS) {
    this.getMobileWS = getMobileWS;
    this._handler = null;
  }

  isEnabled() {
    const mobileWS = this.getMobileWS();
    return mobileWS && mobileWS.getClientCount() > 0;
  }

  requestApproval(payload, { signal } = {}) {
    const mobileWS = this.getMobileWS();
    if (!mobileWS || mobileWS.getClientCount() === 0) {
      return Promise.resolve(null);
    }

    const requestId = "perm_" + crypto.randomBytes(8).toString("hex");

    return new Promise((resolve) => {
      let settled = false;

      const handler = (ws, msg) => {
        if (settled) return;
        if (msg.type === "permission_response" && msg.requestId === requestId) {
          settled = true;
          mobileWS.offClientMessage(handler);
          resolve(msg.behavior || null);
        }
        if (msg.type === "elicitation_response" && msg.requestId === requestId) {
          settled = true;
          mobileWS.offClientMessage(handler);
          resolve({ type: "elicitation-submit", answers: msg.answers || {} });
        }
      };

      mobileWS.onClientMessage(handler);

      // 广播请求
      const wsMsg = {
        type: payload.isElicitation ? "elicitation_request" : "permission_request",
        requestId,
        timestamp: Date.now(),
      };

      if (payload.isElicitation) {
        wsMsg.data = {
          agentId: payload.agentId,
          prompt: payload.prompt,
          options: payload.options,
          sessionId: payload.sessionId,
        };
      } else {
        wsMsg.data = {
          agentId: payload.agentId,
          toolName: payload.toolName,
          toolInputSummary: payload.detail,
          sessionId: payload.sessionId,
          suggestions: payload.suggestions || [],
          timeout: payload.timeout || 90000,
        };
      }

      mobileWS.broadcast(wsMsg);
      console.log("[mobile-approval] Sent " + wsMsg.type + " to " + mobileWS.getClientCount() + " clients");

      // 超时
      const timeout = payload.timeout || 90000;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          mobileWS.offClientMessage(handler);
          console.log("[mobile-approval] Timed out after " + timeout + "ms");
          resolve(null);
        }
      }, timeout);

      // 中止
      if (signal) {
        signal.addEventListener("abort", () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            mobileWS.offClientMessage(handler);
            resolve(null);
          }
        });
      }
    });
  }
}

module.exports = { MobileApprovalClient };
