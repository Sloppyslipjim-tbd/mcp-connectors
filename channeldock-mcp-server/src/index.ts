import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { ChannelDockClient } from "./channeldock-client.js";

const PORT = parseInt(process.env.PORT ?? "3005", 10);
const API_KEY = process.env.CHANNELDOCK_API_KEY ?? "";
const API_SECRET = process.env.CHANNELDOCK_API_SECRET ?? "";
const BASE_URL = process.env.CHANNELDOCK_BASE_URL ?? "https://app.channeldock.com/api/v1";

if (!API_KEY || !API_SECRET) {
  console.error("Missing CHANNELDOCK_API_KEY or CHANNELDOCK_API_SECRET env vars.");
  process.exit(1);
}

console.warn("ÃÂ¢ÃÂÃÂ ÃÂ¯ÃÂ¸ÃÂ  KNOWN ISSUE: ChannelDock API may return HTML instead of JSON. Support has been emailed.");

const client = new ChannelDockClient(API_KEY, API_SECRET, BASE_URL);

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function createServer(): McpServer {
  const server = new McpServer(
    { name: "channeldock-mcp-server", version: "1.0.0" },
    { instructions: "ChannelDock multi-channel order/inventory management for The Brands Den B.V. Known issue: API may return HTML instead of JSON ÃÂ¢ÃÂÃÂ support has been contacted." }
  );

  server.registerTool("get_orders", {
    title: "Get ChannelDock Orders",
    description: "Fetch orders from ChannelDock. Note: API may return HTML instead of JSON (known issue).",
    inputSchema: {
      page: z.number().optional().describe("Page number"),
      status: z.string().optional().describe("Filter by order status"),
    },
  }, async ({ page, status }) => {
    try {
      const result = await client.getOrders(page, status);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_inventory", {
    title: "Get ChannelDock Inventory",
    description: "Fetch full product inventory from ChannelDock.",
    inputSchema: {},
  }, async () => {
    try {
      const result = await client.getInventory();
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_stock_levels", {
    title: "Get ChannelDock Stock Levels",
    description: "Fetch stock levels per product from ChannelDock.",
    inputSchema: {},
  }, async () => {
    try {
      const result = await client.getStockLevels();
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_oos_products", {
    title: "Get Out-of-Stock Products",
    description: "Get products that are out of stock in ChannelDock (FFC). Used for Daily OPS and Heads-Up alerts.",
    inputSchema: {},
  }, async () => {
    try {
      const result = await client.getOosProducts();
      return { content: [{ type: "text" as const, text: JSON.stringify({ count: result.length, products: result }, null, 2) }] };
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
app.use(express.json());


app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "channeldock-mcp-server", version: "1.0.0" });
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
    req.headers.accept = "application/json, text/event-stream";
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
  console.log(`\nÃÂ°ÃÂÃÂÃÂ ChannelDock MCP Server running on http://localhost:${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp\n`);
});
