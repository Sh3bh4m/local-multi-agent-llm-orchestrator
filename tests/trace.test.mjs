import test from "node:test";
import assert from "node:assert/strict";
import { simulate, invokeTool } from "../engine.mjs";

test("simulated runs identify themselves clearly", () => {
  const result = simulate("My order is late and I want a quote");
  assert.equal(result.mode, "simulated");
  assert.deepEqual(result.intents, ["support", "sales"]);
  assert.ok(result.trace.every(event => /no LLM call/i.test(event.detail)));
});

test("role-scoped tool access prevents cross-agent access", () => {
  const result = invokeTool("sales", "get_stock", {sku:"SKU-A100"});
  assert.equal(result.success, false);
});
