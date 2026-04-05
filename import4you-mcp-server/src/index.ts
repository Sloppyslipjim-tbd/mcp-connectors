import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Import4youClient } from "./i4y-client.js";

const PORT = parseInt(process.env.PORT ?? "3007", 10);
const CLIENT_ID = process.env.I4Y_CLIENT_ID ?? "";
const BASE_URL = process.env.I4Y_BASE_URL ?? "https://api.import4you.nl/v1";

if (!CLIENT_ID) {
  console.error("Missing I4Y_CLIENT_ID env var.");
  process.exit(1);
}

console.warn("Ã¢ÂÂ Ã¯Â¸Â  Import4you API endpoints are provisional Ã¢ÂÂ verify with I4Y documentation.");

const client = new Import4youClient(BASE_URL, CLIENT_ID);

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function createServer(): McpServer {
  const server = new McpServer(
    { name: "import4you-mcp-server", version: "1.0.0" },
    { instructions: "Import4you (I4Y) fulfillment/logistics connector for The Brands Den B.V. Note: API endpoints are provisional and may need adjustment once documentation is confirmed." }
  );

  server.registerTool("get_stock_levels", {
    title: "Get I4Y Stock Levels",
    description: "Fetch current stock levels from Import4you fulfillment warehouse. Optionally filter by SKU.",
    inputSchema: {
      sku: z.string().optional().describe("SKU to filter (omit for all products)"),
    },
  }, async ({ sku }) => {
    try {
      const result = await client.getStockLevels(sku);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_shipment_status", {
    title: "Get I4Y Shipment Status",
    description: "Fetch shipment/delivery status from Import4you. Filter by order ID or tracking number.",
    inputSchema: {
      order_id: z.string().optional().describe("Order ID to look up"),
      tracking_number: z.string().optional().describe("Tracking number to look up"),
    },
  }, async ({ order_id, tracking_number }) => {
    try {
      const result = await client.getShipmentStatus(order_id, tracking_number);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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

// Patch Accept header for Claude connector compatibility.
// Claude sends Accept: application/json but the MCP SDK requires
// both application/json and text/event-stream — returns 406 otherwise.
app.use("/mcp", (req: any, _res: any, next: any) => {
  req.headers.accept = "application/json, text/event-stream";
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "import4you-mcp-server", version: "1.0.0" });
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
  console.log(`\nÃ°ÂÂÂ Import4you MCP Server running on http://localhost:${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp\n`);
});
