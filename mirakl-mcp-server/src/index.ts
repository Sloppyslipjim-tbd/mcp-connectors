import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { MiraklClient } from "./mirakl-client.js";

const PORT = parseInt(process.env.PORT ?? "3004", 10);

const marketplaceConfig: Record<string, { apiKey: string; baseUrl: string }> = {
  decathlon: {
    apiKey: process.env.MIRAKL_DECATHLON_API_KEY ?? "",
    baseUrl: process.env.MIRAKL_DECATHLON_BASE_URL ?? "https://marketplace-decathlon-eu.mirakl.net",
  },
  anwb: {
    apiKey: process.env.MIRAKL_ANWB_API_KEY ?? "",
    baseUrl: process.env.MIRAKL_ANWB_BASE_URL ?? "https://anwbnl-prod.mirakl.net",
  },
  mediamarkt: {
    apiKey: process.env.MIRAKL_MEDIAMARKT_API_KEY ?? "",
    baseUrl: process.env.MIRAKL_MEDIAMARKT_BASE_URL ?? "https://mediamarktsaturn.mirakl.net",
  },
};

const client = new MiraklClient(marketplaceConfig);

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function createServer(): McpServer {
  const server = new McpServer(
    { name: "mirakl-mcp-server", version: "1.0.0" },
    { instructions: "Mirakl marketplace connector for The Brands Den B.V. Covers Decathlon, ANWB, and MediaMarkt NL. Known issue: 401 errors reported — auth tokens may need verification." }
  );

  const marketplaceField = z.string().describe("Marketplace: decathlon, anwb, or mediamarkt");

  server.registerTool("get_orders", {
    title: "Get Mirakl Orders",
    description: "Fetch orders from a Mirakl marketplace (Decathlon, ANWB, or MediaMarkt).",
    inputSchema: {
      marketplace: marketplaceField,
      order_states: z.string().optional().describe("Comma-separated order states (default: WAITING_ACCEPTANCE,SHIPPING)"),
    },
  }, async ({ marketplace, order_states }) => {
    try {
      const states = order_states ? order_states.split(",") : undefined;
      const result = await client.getOrders(marketplace, states);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_offers", {
    title: "Get Mirakl Offers",
    description: "Fetch product offers from a Mirakl marketplace.",
    inputSchema: { marketplace: marketplaceField },
  }, async ({ marketplace }) => {
    try {
      const result = await client.getOffers(marketplace);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_messages", {
    title: "Get Mirakl Messages",
    description: "Fetch inbox messages from a Mirakl marketplace.",
    inputSchema: { marketplace: marketplaceField },
  }, async ({ marketplace }) => {
    try {
      const result = await client.getMessages(marketplace);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_shipping_info", {
    title: "Get Mirakl Shipping Info",
    description: "Fetch shipping information from a Mirakl marketplace.",
    inputSchema: { marketplace: marketplaceField },
  }, async ({ marketplace }) => {
    try {
      const result = await client.getShippingInfo(marketplace);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  return server;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "mirakl-mcp-server", version: "1.0.0" });
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
  console.log(`\n🚀 Mirakl MCP Server running on http://localhost:${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp\n`);
});
