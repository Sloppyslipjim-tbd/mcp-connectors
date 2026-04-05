/**
 * FiveX MCP Server ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Remote Streamable HTTP transport
 *
 * Exposes FiveX Analytics API as MCP tools for Claude:
 *   - get_orders: Fetch orders with date/channel filters
 *   - get_returns: Fetch returns with date filters
 *   - get_products: Fetch all products
 *   - get_daily_sales_summary: KPI summary for a given date
 *   - get_sales_by_channel: Channel breakdown for a date range
 *
 * Deploy as a public HTTPS endpoint, then add to Claude via:
 *   Settings ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Connectors ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Add custom connector ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ paste URL
 */

import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { FiveXClient } from "./fivex-client.js";

// ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Config ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const FIVEX_API_KEY = process.env.FIVEX_API_KEY ?? "";
const FIVEX_API_SECRET = process.env.FIVEX_API_SECRET ?? "";
const FIVEX_BASE_URL =
  process.env.FIVEX_BASE_URL ?? "https://app.fivex.nl/api/v1";

if (!FIVEX_API_KEY || !FIVEX_API_SECRET) {
  console.error("Missing FIVEX_API_KEY or FIVEX_API_SECRET env vars.");
  process.exit(1);
}

const fivex = new FiveXClient({
  apiKey: FIVEX_API_KEY,
  apiSecret: FIVEX_API_SECRET,
  baseUrl: FIVEX_BASE_URL,
});

// ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ Session management ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ

const sessions = new Map<
  string,
  {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
  }
>();

/**
 * Create a fresh McpServer instance with all tools registered.
 * Each session gets its own server to prevent transport overwrites.
 */
function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "fivex-mcp-server",
      version: "1.0.0",
    },
    {
      instructions: `FiveX Analytics MCP server for The Brands Den B.V.
Provides access to e-commerce order data, returns, and product information across all sales channels (Bol.com, Amazon, MediaMarkt, Decathlon, ANWB, Shopify).
Currency is EUR. Use Dutch notation (ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ¬ 1.234,56).
Date format: YYYY-MM-DD.
Known limitation: FiveX ignores date parameters server-side, so filtering is done client-side after fetching all data. This means queries for recent dates may take a moment as all orders are paginated through.`,
    }
  );

  server.registerTool("get_orders",{title:"Get FiveX Orders",description:"Fetch orders from FiveX Analytics. Supports date range and channel filtering.",inputSchema:{start_date:z.string().optional().describe("Start date (YYYY-MM-DD)"),end_date:z.string().optional().describe("End date (YYYY-MM-DD)"),channel:z.string().optional().describe("Filter by sales channel")}},async({start_date,end_date,channel})=>{try{const orders=await fivex.getOrders(start_date,end_date,channel);return{content:[{type:"text" as const,text:JSON.stringify({count:orders.length,orders:orders.slice(0,100),truncated:orders.length>100},null,2)}]}}catch(err){return{content:[{type:"text" as const,text:`Error: ${err instanceof Error?err.message:String(err)}`}],isError:true}}});

  server.registerTool("get_returns",{title:"Get FiveX Returns",description:"Fetch return orders from FiveX.",inputSchema:{start_date:z.string().optional().describe("Start date"),end_date:z.string().optional().describe("End date")}},async({start_date,end_date})=>{try{const returns=await fivex.getReturns(start_date,end_date);return{content:[{type:"text" as const,text:JSON.stringify({count:returns.length,returns},null,2)}]}}catch(err){return{content:[{type:"text" as const,text:`Error: ${err instanceof Error?err.message:String(err)}`}],isError:true}}});

  server.registerTool("get_products",{title:"Get FiveX Products",description:"Fetch all products from FiveX.",inputSchema:{}},async()=>{try{const products=await fivex.getProducts();return{content:[{type:"text" as const,text:JSON.stringify({count:products.length,products},null,2)}]}}catch(err){return{content:[{type:"text" as const,text:`Error: ${err instanceof Error?err.message:String(err)}`}],isError:true}}});

  server.registerTool("get_daily_sales_summary",{title:"Get Daily Sales Summary",description:"Compute daily sales summary KPIs.",inputSchema:{date:z.string().describe("Date (YYYY-MM-DD)")}},async({date})=>{try{const summary=await fivex.getDailySalesSummary(date);return{content:[{type:"text" as const,text:JSON.stringify(summary,null,2)}]}}catch(err){return{content:[{type:"text" as const,text:`Error: ${err instanceof Error?err.message:String(err)}`}],isError:true}}});

  server.registerTool("get_sales_by_channel",{title:"Get Sales by Channel",description:"Sales breakdown by channel.",inputSchema:{start_date:z.string().describe("Start date"),end_date:z.string().describe("End date")}},async({start_date,end_date})=>{try{const channels=await fivex.getSalesByChannel(start_date,end_date);return{content:[{type:"text" as const,text:JSON.stringify(channels,null,2)}]}}catch(err){return{content:[{type:"text" as const,text:`Error: ${err instanceof Error?err.message:String(err)}`}],isError:true}}});

  return server;
}

const app=express();app.use(cors({
  exposedHeaders: ['Mcp-Session-Id'],
}));app.use(express.json());app.use("/mcp",(req:any,_res:any,next:any)=>{const ai=req.rawHeaders.findIndex((h:string)=>h.toLowerCase()==="accept");if(ai!==-1)req.rawHeaders[ai+1]="application/json, text/event-stream";req.headers.accept="application/json, text/event-stream";next()});


app.get("/health",(_req,res)=>{res.json({status:"ok",server:"fivex-mcp-server",version:"1.0.3-accept-fix"})});

app.post("/mcp",async(req,res)=>{try{const sessionId=req.headers["mcp-session-id"] as string|undefined;if(sessionId&&sessions.has(sessionId)){await sessions.get(sessionId)!.transport.handleRequest(req,res,req.body);return}const server=createServer();const transport=new StreamableHTTPServerTransport({sessionIdGenerator:()=>randomUUID()});transport.onclose=()=>{const sid=transport.sessionId;if(sid)sessions.delete(sid)};await server.connect(transport);const sid=transport.sessionId;if(sid)sessions.set(sid,{transport,server});await transport.handleRequest(req,res,req.body)}catch(err){if(!res.headersSent)res.status(500).json({error:String(err)})}});

app.get("/mcp",async(req,res)=>{const sessionId=req.headers["mcp-session-id"] as string|undefined;if(!sessionId||!sessions.has(sessionId)){res.status(400).json({error:"Invalid session"});return}await sessions.get(sessionId)!.transport.handleRequest(req,res)});

app.delete("/mcp",async(req,res)=>{const sessionId=req.headers["mcp-session-id"] as string|undefined;if(!sessionId||!sessions.has(sessionId)){res.status(400).json({error:"Invalid session"});return}await sessions.get(sessionId)!.transport.handleRequest(req,res);sessions.delete(sessionId)});

app.listen(PORT,()=>{console.log(`\nÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ°ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ FiveX MCP Server running on http://localhost:${PORT}`);console.log(`   MCP endpoint: http://localhost:${PORT}/mcp\n`)});
