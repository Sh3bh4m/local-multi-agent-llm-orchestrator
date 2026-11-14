import test from "node:test";
import assert from "node:assert/strict";
import { invokeTool } from "../engine.mjs";

test("LLM string quantity produces correct quote", () => {
  const result = invokeTool("sales", "draft_quote", {
    sku: "A100",
    quantity: "10"
  });

  assert.equal(result.success, true);
  assert.equal(result.data.sku, "SKU-A100");
  assert.equal(result.data.quantity, 10);
  assert.equal(result.data.total, 240);
});

test("invalid quantities are rejected", () => {
  const invalid = ["0", "1001", "10.5", "1e1", "ten", "-1", "09"];

  for (const quantity of invalid) {
    const result = invokeTool("sales", "draft_quote", {
      sku: "A100",
      quantity
    });

    assert.equal(result.success, false, quantity);
  }
});