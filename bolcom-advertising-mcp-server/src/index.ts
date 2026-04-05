import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { BolcomAdClient } from "./bolcom-ad-client.js";

const PORT = parseInt(process.env.PORT ?? "3006", 10);
const CLIENT_ID = process.env.BOLCOM_AD_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.BOLCOM_AD_CLIENT_SECRET ?? "";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing BOLCOM_AD_CLIENT_ID or BOLCOM_AD_CLIENT_SECRET env vars.");
  process.exit(1);
}

const client = new BolcomAdClient(CLIENT_ID, CLIENT_SECRET);

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function createServer(): McpServer {
  const server = new McpServer(
    { name: "bolcom-advertising-mcp-server", version: "1.0.0" },
    { instructions: "Bol.com Advertising API connector for The Brands Den B.V. Provides ad campaign data, performance metrics, and spend tracking. Currency: EUR." }
  );

  server.registerTool("get_campaigns", {
    title: "Get Ad Campaigns",
    description: "Fetch all Bol.com advertising campaigns with status, budget, and type.",
    inputSchema: {},
  }, async () => {
    try {
      const result = await client.getCampaigns();
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_ad_performance", {
    title: "Get Ad Performance",
    description: "Get advertising performance metrics: impressions, clicks, CTR, CPC, spend. Optionally filter by campaign.",
    inputSchema: {
      campaign_id: z.string().optional().describe("Campaign ID to filter (omit for all campaigns)"),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
    },
  }, async ({ campaign_id, start_date, end_date }) => {
    try {
      const result = await client.getAdPerformance(campaign_id, start_date, end_date);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });

  server.registerTool("get_ad_spend", {
    title: "Get Total Ad Spend",
    description: "Get total advertising spend across all campaigns for a date range. Used for Weekly OPS profitability analysis.",
    inputSchema: {
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
    },
  }, async ({ start_date, end_date }) => {
    try {
      const result = await client.getAdSpend(start_date, end_date);
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
  res.json({ status: "ok", server: "bolcom-advertising-mcp-server", version: "1.0.0" });
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
  console.log(`\nÃ°ÂÂÂ Bol.com Advertising MCP Server running on http://localhost:${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp\n`);
});
