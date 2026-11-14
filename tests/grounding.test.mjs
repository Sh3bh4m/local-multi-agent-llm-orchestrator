import test from "node:test";
import assert from "node:assert/strict";
import { composeGroundedResponse } from "../grounding.mjs";
import { respond } from "../engine.mjs";

test("failed tool errors remain visible without invented values", () => {
  const output = composeGroundedResponse(
    ["sales"],
    [{
      phase: "tool",
      agent: "sales",
      tool: "draft_quote",
      result: "failed",
      toolError: "Product not found"
    }]
  );

  assert.equal(output.incomplete, true);
  assert.match(output.response, /Product not found/);
  assert.doesNotMatch(output.response, /\$5,000/);
});

test("contradictory model drafts cannot override verified data", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = "mock-only";

  const reply = message => ({
    ok: true,
    json: async () => ({
      choices: [{ message }]
    })
  });

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const system = body.messages[0].content;
    const hasTool = body.messages.some(m => m.role === "tool");

    if (system.includes("Classify user messages")) {
      return reply({
        content: '{"intents":["support","sales"]}'
      });
    }

    if (system.includes("You are the support specialist")) {
      return hasTool
        ? reply({content:"Please provide your order number again."})
        : reply({
            content:null,
            tool_calls:[{
              id:"support-1",
              type:"function",
              function:{
                name:"lookup_order",
                arguments:'{"order_id":"ORD-1001"}'
              }
            }]
          });
    }

    if (system.includes("You are the sales specialist")) {
      return hasTool
        ? reply({content:"The total is $5,000."})
        : reply({
            content:null,
            tool_calls:[{
              id:"sales-1",
              type:"function",
              function:{
                name:"draft_quote",
                arguments:'{"sku":"A100","quantity":"10"}'
              }
            }]
          });
    }

    throw new Error("Unexpected model request");
  };

  try {
    const result = await respond(
      "Check ORD-1001 and quote 10 units of SKU-A100"
    );

    assert.equal(result.mode, "live");
    assert.equal(result.needs_human, false);
    assert.match(result.response, /ORD-1001/);
    assert.match(result.response, /delayed/);
    assert.match(result.response, /\$240\.00/);
    assert.doesNotMatch(result.response, /\$5,000/);
    assert.doesNotMatch(result.response, /provide your order number/i);

    assert.equal(
      result.trace.filter(e =>
        e.phase === "tool" && e.result === "success"
      ).length,
      2
    );

    assert.ok(result.trace.some(e =>
      e.phase === "grounded_merge"
    ));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});