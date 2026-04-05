import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ReturnlessClient } from "./returnless-client.js";

const PORT = parseInt(process.env.PORT ?? "3003", 10);
const BEARER_TOKEN = process.env.RETURNLESS_BEARER_TOKEN ?? "";
const BASE_URL = process.env.RETURNLESS_BASE_URL ?? "https://api-v2.returnless.com/2025-01/";

if (!BEARER_TOKEN) {
  console.error("Missing RETURNLESS_BEARER_TOKEN env var.");
  process.exit(1);
}

const client = new ReturnlessClient(BEARER_TOKEN, BASE_URL);

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function createServer(): McpServer {
  const server = new McpServer(
    { name: "returnless-mcp-server", version: "1.0.0" },
    { instructions: "Returnless return management API for The Brands Den B.V. Provides return order data and statistics." }
  );

  server.registerTool("get_return_orders", {
    title: "Get Return Orders",
    description: "Fetch return orders from Returnless. Supports pagination and status filtering.",
    inputSchema: {
      limit: z.number().optional().describe("Number of results per page (default 100)"),
      page: z.number().optional().describe("Page number"),
      status: z.string().optional().describe("Filter by status (e.g. pending, approved)"),
    },
  }, async ({ limit, page, status }) => {
    try {
      const orders = await client.getReturnOrders(limit, page, status);
      return { content: [{ type: "text" as const, text: JSON.stringify({ count: orders.length, orders }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_return_stats", {
    title: "Get Return Statistics",
    description: "Compute return statistics: total count, breakdown by reason, by status, and top products by return count.",
    inputSchema: {
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
    },
  }, async ({ start_date, end_date }) => {
    try {
      const stats = await client.getReturnStats(start_date, end_date);
      return { content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  return server;
}

const app = express();
app.use(cors({
  exposedHeaders: ['Mcp-Session-Id'],
}));
app.use(express.json());app.use("/mcp",(req:any,_res:any,next:any)=>{const ai=req.rawHeaders.findIndex((h:string)=>h.toLowerCase()==="accept");if(ai!==-1)req.rawHeaders[ai+1]="application/json, text/event-stream";req.headers.accept="application/json, text/event-stream";next()});



app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "returnless-mcp-server", version: "1.0.0" });
});

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.transport.handleRequest(req, res, req.body);
      return;
    }
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
    transport.onclose = () => { const sid = transport.sessionId; if (sid) sessions.delete(sid); };
    await server.connect(transport);
    const sid = transport.sessionId;
    if (sid) sessions.set(sid, { transport, server });
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) { res.status(400).json({ error: "Invalid session" }); return; }
  await sessions.get(sessionId)!.transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) { res.status(400).json({ error: "Invalid session" }); return; }
  await sessions.get(sessionId)!.transport.handleRequest(req, res);
  sessions.delete(sessionId);
});

app.listen(PORT, () => {
  console.log(`\nÃÂÃÂÃÂÃÂ°ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Returnless MCP Server running on http://localhost:${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp\n`);
});
