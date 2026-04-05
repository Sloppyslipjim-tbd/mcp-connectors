import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { BolcomClient } from "./bolcom-client.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const CLIENT_ID = process.env.BOLCOM_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.BOLCOM_CLIENT_SECRET ?? "";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing BOLCOM_CLIENT_ID or BOLCOM_CLIENT_SECRET env vars.");
  process.exit(1);
}

const bolcom = new BolcomClient(CLIENT_ID, CLIENT_SECRET);

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function createServer(): McpServer {
  const server = new McpServer(
    { name: "bolcom-retailer-mcp-server", version: "1.0.0" },
    { instructions: "Bol.com Retailer API connector for The Brands Den B.V. Provides access to orders, shipments, returns, offers, performance indicators, and reviews. Currency: EUR." }
  );

  server.registerTool("get_orders", { title: "Get Bol.com Orders", description: "Fetch recent orders from Bol.com Retailer API.", inputSchema: { page: z.number().optional().describe("Page number (default 1)") } }, async ({ page }) => {
    try { const r = await bolcom.getOrders(page); return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] }; }
    catch (e) { return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true }; }
  });

  server.registerTool("get_shipments", { title: "Get Bol.com Shipments", description: "Fetch shipment data from Bol.com.", inputSchema: { page: z.number().optional().describe("Page number") } }, async ({ page }) => {
    try { const r = await bolcom.getShipments(page); return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] }; }
    catch (e) { return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true }; }
  });

  server.registerTool("get_returns", { title: "Get Bol.com Returns", description: "Fetch returns from Bol.com.", inputSchema: { page: z.number().optional().describe("Page number"), handled: z.boolean().optional().describe("Filter by handled status") } }, async ({ page, handled }) => {
    try { const r = await bolcom.getReturns(page, handled); return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] }; }
    catch (e) { return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true }; }
  });

  server.registerTool("get_offers", { title: "Get Bol.com Offers", description: "Fetch your product offers/listings from Bol.com.", inputSchema: { page: z.number().optional().describe("Page number") } }, async ({ page }) => {
    try { const r = await bolcom.getOffers(page); return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] }; }
    catch (e) { return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true }; }
  });

  server.registerTool("get_performance_indicators", { title: "Get Bol.com Performance Indicators", description: "Get seller performance scores.", inputSchema: { name: z.string().describe("Indicator name"), year: z.number().describe("Year"), week: z.number().describe("ISO week number") } }, async ({ name, year, week }) => {
    try { const r = await bolcom.getPerformanceIndicators(name, year, week); return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] }; }
    catch (e) { return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true }; }
  });

  server.registerTool("get_reviews", { title: "Get Bol.com Reviews", description: "Fetch product reviews from Bol.com.", inputSchema: { page: z.number().optional().describe("Page number") } }, async ({ page }) => {
    try { const r = await bolcom.getReviews(page); return { content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }] }; }
    catch (e) { return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true }; }
  });

  return server;
}

const app = express(); app.use(cors({
  exposedHeaders: ['Mcp-Session-Id'],
})); app.use(express.json());
app.use("/mcp",(req:any,_r:any,n:any)=>{req.headers.accept="application/json, text/event-stream";n()});

app.get("/health", (_req, res) => { res.json({ status: "ok", server: "bolcom-retailer-mcp-server", version: "1.0.0" }); });
app.post("/mcp", async (req, res) => { try { const sid = req.headers["mcp-session-id"] as string | undefined; if (sid && sessions.has(sid)) { await sessions.get(sid)!.transport.handleRequest(req, res, req.body); return; } const server = createServer(); const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() }); transport.onclose = () => { const s = transport.sessionId; if (s) sessions.delete(s); }; await server.connect(transport); const s = transport.sessionId; if (s) sessions.set(s, { transport, server }); await transport.handleRequest(req, res, req.body); } catch (err) { if (!res.headersSent) res.status(500).json({ error: String(err) }); } });
app.get("/mcp", async (req, res) => { const sid = req.headers["mcp-session-id"] as string | undefined; if (!sid || !sessions.has(sid)) { res.status(400).json({ error: "Invalid session" }); return; } await sessions.get(sid)!.transport.handleRequest(req, res); });
app.delete("/mcp", async (req, res) => { const sid = req.headers["mcp-session-id"] as string | undefined; if (!sid || !sessions.has(sid)) { res.status(400).json({ error: "Invalid session" }); return; } await sessions.get(sid)!.transport.handleRequest(req, res); sessions.delete(sid); });
app.listen(PORT, () => { console.log(`\nÃÂÃÂ°ÃÂÃÂÃÂÃÂÃÂÃÂ Bol.com Retailer MCP Server running on http://localhost:${PORT}`); console.log(`   MCP endpoint: http://localhost:${PORT}/mcp\n`); });
