import test from "node:test";
import assert from "node:assert/strict";
import { invokeTool, respond } from "../engine.mjs";

test("short SKU resolves to the canonical product", () => {
  const result = invokeTool("sales", "get_price", { sku: "A100" });
  assert.equal(result.success, true);
  assert.equal(result.data.sku, "SKU-A100");
  assert.equal(result.data.price, 24);
});

test("lowercase SKU alias resolves correctly", () => {
  const result = invokeTool("ops", "get_stock", { sku: "sku-b200" });
  assert.equal(result.success, true);
  assert.equal(result.data.sku, "SKU-B200");
  assert.equal(result.data.quantity, 32);
});

test("quote preview uses canonical SKU and correct total", () => {
  const result = invokeTool("sales", "draft_quote", {
    sku: " A100 ",
    quantity: 10
  });

  assert.equal(result.success, true);
  assert.equal(result.data.sku, "SKU-A100");
  assert.equal(result.data.quantity, 10);
  assert.equal(result.data.total, 240);
  assert.equal(result.data.status, "preview_only");
});

test("unknown products remain rejected", () => {
  const result = invokeTool("sales", "draft_quote", {
    sku: "A999",
    quantity: 10
  });
  assert.equal(result.success, false);
  assert.equal(result.error, "Product not found");
});

test("inherited object properties are not valid products", () => {
  const result = invokeTool("sales", "get_price", {
    sku: "__proto__"
  });
  assert.equal(result.success, false);
});

test("model-style tool call with A100 succeeds", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = "mock-test-key";

  const replies = [
    { content: '{"intents":["sales"]}' },
    {
      content: null,
      tool_calls: [{
        id: "quote-test-1",
        type: "function",
        function: {
          name: "draft_quote",
          arguments: '{"sku":"A100","quantity":10}'
        }
      }]
    },
    { content: "The fictional preview quote is $240." }
  ];

  let calls = 0;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: replies[calls++] }]
    })
  });

  try {
    const result = await respond(
      "Prepare a quote for 10 units of A100"
    );

    assert.equal(result.mode, "live");
    assert.deepEqual(result.intents, ["sales"]);
    assert.equal(calls, 3);
    assert.equal(result.needs_human, false);
    assert.match(result.response, /\$240/);

    assert.ok(result.trace.some(event =>
      event.phase === "tool" &&
      event.agent === "sales" &&
      event.result === "success"
    ));
  } finally {
    globalThis.fetch = oldFetch;

    if (oldKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = oldKey;
    }
  }
});