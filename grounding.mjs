export function composeGroundedResponse(intents, events) {
  const find = (agent, tool) =>
    events.find(e =>
      e.phase === "tool" &&
      e.agent === agent &&
      e.tool === tool &&
      e.result === "success" &&
      e.verifiedData
    )?.verifiedData;

  const failureReason = agent => {
    const error = events.find(e =>
      e.phase === "tool" &&
      e.agent === agent &&
      e.result === "failed" &&
      typeof e.toolError === "string"
    )?.toolError;

    return error ? ` ${error}` : "";
  };

  const sections = [];
  let incomplete = false;

  if (intents.includes("support")) {
    const order = find("support", "lookup_order");

    if (order &&
        typeof order.id === "string" &&
        typeof order.status === "string") {
      sections.push(
        `Order ${order.id}: ${order.status}. ` +
        (typeof order.delivery === "string" ? order.delivery : "")
      );
    } else {
      sections.push(
        "Support: no order status could be verified." +
        failureReason("support")
      );
      incomplete = true;
    }
  }

  if (intents.includes("sales")) {
    const quote = find("sales", "draft_quote");
    const price = find("sales", "get_price");

    if (quote &&
        typeof quote.sku === "string" &&
        Number.isInteger(quote.quantity) &&
        quote.quantity > 0 &&
        Number.isFinite(quote.total) &&
        quote.total >= 0 &&
        quote.currency === "USD" &&
        quote.status === "preview_only") {
      sections.push(
        `Fictional quote preview: ${quote.quantity} units of ` +
        `${quote.sku}, total $${quote.total.toFixed(2)} USD. ` +
        "This is not a final quotation."
      );
    } else if (
        price &&
        typeof price.sku === "string" &&
        Number.isFinite(price.price) &&
        price.currency === "USD") {
      sections.push(
        `Verified fictional price for ${price.sku}: ` +
        `$${price.price.toFixed(2)} USD per unit.`
      );
    } else {
      sections.push(
        "Sales: no quotation or price could be verified." +
        failureReason("sales")
      );
      incomplete = true;
    }
  }

  if (intents.includes("ops")) {
    const stock = find("ops", "get_stock");

    if (stock &&
        typeof stock.sku === "string" &&
        Number.isInteger(stock.quantity)) {
      sections.push(
        `Fictional inventory: ${stock.sku}, ` +
        `${stock.quantity} units recorded.`
      );
    } else {
      sections.push(
        "Operations: no inventory could be verified." +
        failureReason("ops")
      );
      incomplete = true;
    }
  }

  return {
    response: sections.join("\n\n") ||
      "No verified tool result is available.",
    incomplete: incomplete || sections.length === 0
  };
}