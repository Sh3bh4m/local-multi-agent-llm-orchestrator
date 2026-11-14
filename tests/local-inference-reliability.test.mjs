import test from "node:test";
import assert from "node:assert/strict";
import {
  respond, invokeTool, modelTimeoutMs, agentExecutionMode
} from "../engine.mjs";

function restoreEnv(name, oldValue) {
  if (oldValue === undefined) delete process.env[name];
  else process.env[name] = oldValue;
}

test("local inference settings use valid overrides and bounded fallbacks", () => {
  // Explicit invalid inputs are environment-independent.
  // Passing undefined intentionally reads the current environment.
  assert.equal(modelTimeoutMs("not-a-number"), 120000);
  assert.equal(modelTimeoutMs("500"), 120000);
  assert.equal(modelTimeoutMs("900000"), 120000);
  assert.equal(modelTimeoutMs("240000"), 240000);
  assert.equal(agentExecutionMode("sequential"), "sequential");
  assert.equal(agentExecutionMode("invalid"), "parallel");
  assert.equal(
    modelTimeoutMs(undefined),
    modelTimeoutMs(process.env.MODEL_TIMEOUT_MS)
  );
  assert.equal(
    agentExecutionMode(undefined),
    agentExecutionMode(process.env.AGENT_EXECUTION_MODE)
  );
});

test("fictional order lookup rejects inherited properties and invalid arguments", () => {
  assert.equal(invokeTool("support", "lookup_order", { order_id: "__proto__" }).success, false);
  assert.equal(invokeTool("support", "lookup_order", { order_id: "constructor" }).success, false);
  assert.equal(invokeTool("support", "lookup_order", { order_id: "ORD-1001" }).success, true);
  assert.equal(invokeTool("support", "lookup_order", null).success, false);
  assert.equal(invokeTool("support", "lookup_order", []).success, false);
});

test("sequential execution avoids overlapping specialist requests and preserves tool grounding", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.OPENAI_API_KEY;
  const oldMode = process.env.AGENT_EXECUTION_MODE;
  process.env.OPENAI_API_KEY = "mock-test-only";
  process.env.AGENT_EXECUTION_MODE = "sequential";
  let inFlight = 0;
  let maxInFlight = 0;
  const responses = { support: 0, sales: 0 };

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const prompt = body.messages[0].content;
    const reply = message => ({
      ok: true, json: async () => ({ choices: [{ message }] })
    });

    if (prompt.includes("Classify user messages")) {
      return reply({ content: '{"intents":["support","sales"]}' });
    }
    const agent = prompt.includes("You are the support specialist") ? "support"
      : prompt.includes("You are the sales specialist") ? "sales" : null;
    assert.ok(agent, "expected known specialist");
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 8));
    inFlight--;
    responses[agent]++;

    if (responses[agent] > 1) {
      return reply({ content: "A model-generated answer that is not used for verified facts." });
    }
    return reply({
      content: null,
      tool_calls: [{
        id: agent + "-call",
        type: "function",
        function: agent === "support"
          ? { name: "lookup_order", arguments: '{"order_id":"ORD-1001"}' }
          : { name: "draft_quote", arguments: '{"sku":"A100","quantity":10}' }
      }]
    });
  };

  try {
    const result = await respond("Check ORD-1001 and quote 10 units of SKU-A100");
    assert.equal(maxInFlight, 1);
    assert.deepEqual(result.intents, ["support", "sales"]);
    assert.equal(result.needs_human, false);
    assert.match(result.response, /ORD-1001/);
    assert.match(result.response, /\$240\.00/);
    assert.ok(result.trace.some(e => e.phase === "dispatch" && /sequential/.test(e.detail)));
    assert.equal(result.trace.filter(e => e.phase === "tool" && e.result === "success").length, 2);
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv("OPENAI_API_KEY", oldKey);
    restoreEnv("AGENT_EXECUTION_MODE", oldMode);
  }
});

test("specialist errors are visible without leaking arbitrary exception messages", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.OPENAI_API_KEY;
  const oldMode = process.env.AGENT_EXECUTION_MODE;
  process.env.OPENAI_API_KEY = "mock-test-only";
  process.env.AGENT_EXECUTION_MODE = "sequential";

  globalThis.fetch = async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[0].content;
    if (prompt.includes("Classify user messages")) {
      return { ok: true, json: async () => ({
        choices: [{ message: { content: '{"intents":["support","sales"]}' } }]
      }) };
    }
    if (prompt.includes("You are the support specialist")) {
      throw new DOMException("local service stopped", "TimeoutError");
    }
    if (prompt.includes("You are the sales specialist")) {
      return { ok: true, json: async () => ({
        choices: [{ message: { content: null, tool_calls: [{
          id: "sales",
          type: "function",
          function: { name: "draft_quote", arguments: '{"sku":"A100","quantity":10}' }
        }] } }]
      }) };
    }
    throw new Error("Unexpected call");
  };
  try {
    // No model follow-up is provided for sales; the next response repeats a tool.
    // The support failure must still be surfaced, without an invented order status.
    const result = await respond("Check ORD-1001 and quote 10 units of SKU-A100");
    assert.equal(result.needs_human, true);
    assert.ok(result.trace.some(e =>
      e.phase === "error" && e.agent === "support" && /timed out/.test(e.detail)
    ));
    assert.match(result.response, /Support: no order status could be verified/);
    assert.doesNotMatch(JSON.stringify(result.trace), /local service stopped/);
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv("OPENAI_API_KEY", oldKey);
    restoreEnv("AGENT_EXECUTION_MODE", oldMode);
  }
});

test("a specialist that produces no tool calls is explicitly flagged", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "mock-test-only";
  globalThis.fetch = async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[0].content;
    return { ok: true, json: async () => ({
      choices: [{ message: {
        content: prompt.includes("Classify user messages")
          ? '{"intents":["support"]}' : "The order definitely shipped."
      } }]
    }) };
  };
  try {
    const result = await respond("Check order ORD-1001");
    assert.equal(result.needs_human, true);
    assert.match(result.response, /no order status could be verified/);
    assert.ok(result.trace.some(e => e.phase === "guard" && e.agent === "support"));
    assert.doesNotMatch(result.response, /definitely shipped/);
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv("OPENAI_API_KEY", oldKey);
  }
});
