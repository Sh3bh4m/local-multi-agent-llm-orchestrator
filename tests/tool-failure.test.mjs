import test from "node:test";
import assert from "node:assert/strict";
import { respond } from "../engine.mjs";

test("failed quote tool prevents unverified pricing", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "local-test-only";

  let calls = 0;

  globalThis.fetch = async () => {
    calls++;
    const message = calls === 1
      ? { content: '{"intents":["sales"]}' }
      : {
          content: null,
          tool_calls: [{
            id: "test-call",
            type: "function",
            function: {
              name: "draft_quote",
              arguments: '{"sku":"INVALID-SKU","quantity":10}'
            }
          }]
        };

    return {
      ok: true,
      json: async () => ({ choices: [{ message }] })
    };
  };

  try {
    const result = await respond("Quote 10 INVALID-SKU units");

    assert.equal(result.mode, "live");
    assert.equal(calls, 2);
    assert.equal(result.needs_human, true);
    assert.match(result.response, /Product not found/);
    assert.doesNotMatch(result.response, /\$5,000/);
    assert.ok(result.trace.some(e => e.phase === "guard"));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});