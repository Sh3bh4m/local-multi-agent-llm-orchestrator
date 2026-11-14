import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { respond } from "./engine.mjs";

const port = Number(process.env.PORT || 3000);
const sessions = new Map();

async function readBody(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk.toString("utf8");
    if (text.length > 8000) throw new Error("Request too large");
  }
  return JSON.parse(text);
}

const html = await readFile(new URL("./public/index.html", import.meta.url));

const server = http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method === "GET" && req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, mode:
      process.env.OPENAI_API_KEY ? "live" : "simulated" }));
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    try {
      const body = await readBody(req);
      if (typeof body.message !== "string" ||
          !body.message.trim() || body.message.length > 2000) {
        res.writeHead(400);
        return res.end("A valid message is required");
      }

      const id = typeof body.conversationId === "string" &&
        /^[a-zA-Z0-9-]{1,80}$/.test(body.conversationId) ?
        body.conversationId : randomUUID();

      let history = sessions.get(id) || [];
      const result = await respond(body.message, history);
      history = [
        ...history,
        { role: "user", content: body.message },
        { role: "assistant", content: result.response }
      ].slice(-8);
      sessions.set(id, history);

      if (sessions.size > 100) sessions.delete(sessions.keys().next().value);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ conversationId: id, ...result }));
    } catch (error) {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: error.message }));
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Demo ready: http://127.0.0.1:${port}`);
  console.log(process.env.OPENAI_API_KEY ? "Live LLM mode" : "Simulated mode");
});