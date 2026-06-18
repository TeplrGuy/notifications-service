const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await wait(150);
  }
  throw new Error("notifications-service did not become healthy in time");
}

test("notifications accept event and expose query endpoint", async () => {
  const port = String(4000 + Math.floor(Math.random() * 200));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn("node", ["src/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: port },
    stdio: "ignore"
  });

  try {
    await waitForHealth(baseUrl);

    const invalid = await fetch(`${baseUrl}/notifications/order-created`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "ord-1" })
    });
    assert.equal(invalid.status, 400);

    const accepted = await fetch(`${baseUrl}/notifications/order-created`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "ord-1",
        customerId: "cust-1",
        createdAt: new Date().toISOString()
      })
    });
    assert.equal(accepted.status, 202);

    const orderEvents = await fetch(`${baseUrl}/notifications/order/ord-1`);
    assert.equal(orderEvents.status, 200);
    const payload = await orderEvents.json();
    assert.equal(payload.count, 1);
  } finally {
    child.kill("SIGTERM");
  }
});
