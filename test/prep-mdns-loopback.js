const bonjour = require("bonjour")();

// 发布
const b1 = bonjour.publish({ name: "Test", type: "clawd", protocol: "tcp", port: 9999 });
console.log("[test] Published test service");

// 发现
setTimeout(() => {
  const b2 = bonjour.find({ type: "clawd" }, (service) => {
    console.log("  PASS: Discovered:", service.name, service.port);
    b1.stop();
    bonjour.destroy();
    process.exit(0);
  });
}, 1000);

setTimeout(() => {
  console.error("  FAIL: Timeout");
  b1.stop();
  bonjour.destroy();
  process.exit(1);
}, 6000);
