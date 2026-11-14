import test from "node:test";
import assert from "node:assert/strict";
import { classifyMock, invokeTool, simulate, respond } from "../engine.mjs";

test("support classification", () => {
  assert.deepEqual(classifyMock("Where is my order?"), ["support"]);
});

test("mixed-intent classification", () => {
  assert.deepEqual(classifyMock("Late order and new quote"), ["support", "sales"]);
});

test("unclear message requests clarification", () => {
  assert.deepEqual(classifyMock("Hi"), ["unclear"]);
});

test("tools are agent-scoped", () => {
  const result = invokeTool("support", "get_stock", { sku: "SKU-A100" });
  assert.equal(result.success, false);
});

test("inventory uses fictional data", () => {
  const result = invokeTool("ops", "get_stock", { sku: "SKU-A100" });
  assert.equal(result.data.quantity, 180);
});

test("quote creation is a non-persistent preview", () => {
  const result = invokeTool("sales", "draft_quote",
    { sku: "SKU-A100", quantity: 10 });
  assert.equal(result.success, true);
  assert.equal(result.data.total, 240);
  assert.equal(result.data.status, "preview_only");
});

test("large quotes require human review", () => {
  const result = invokeTool("sales", "draft_quote",
    { sku: "SKU-A100", quantity: 500 });
  assert.equal(result.needs_human, true);
});

test("simulated output clearly identifies its mode", () => {
  assert.equal(simulate("What is the price?").mode, "simulated");
});

test("no key never pretends an LLM has run", async () => {
  const old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await respond("What is the stock?");
    assert.equal(result.mode, "simulated");
  } finally {
    if (old !== undefined) process.env.OPENAI_API_KEY = old;
  }
});