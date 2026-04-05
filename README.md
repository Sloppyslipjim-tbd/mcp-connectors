# Buddy MCP Connectors — The Brands Den B.V.

All 7 custom MCP connectors for the Buddy AI Operations Assistant.

## Connectors Overview

| # | Connector | Port | Tools | Status |
|---|-----------|------|-------|--------|
| 1 | **FiveX Analytics** | 3001 | get_orders, get_returns, get_products, get_daily_sales_summary, get_sales_by_channel | Ready |
| 2 | **Bol.com Retailer** | 3002 | get_orders, get_shipments, get_returns, get_offers, get_performance_indicators, get_reviews | Ready |
| 3 | **Returnless** | 3003 | get_return_orders, get_return_stats | Ready |
| 4 | **Mirakl** (Decathlon, ANWB, MediaMarkt) | 3004 | get_orders, get_offers, get_messages, get_shipping_info | Ready (⚠️ 401 auth issue reported) |
| 5 | **ChannelDock** | 3005 | get_orders, get_inventory, get_stock_levels, get_oos_products | Ready (⚠️ HTML response issue) |
| 6 | **Bol.com Advertising** | 3006 | get_campaigns, get_ad_performance, get_ad_spend | Ready |
| 7 | **Import4you** | 3007 | get_stock_levels, get_shipment_status | Ready (⚠️ endpoints need verification) |

## Quick Start

### 1. Test API connections first
```bash
bash test-apis.sh
```

### 2. Deploy all to Railway (recommended)
```bash
bash deploy-all.sh
```
This handles: Railway login, project creation, env vars, deployment, and prints all URLs.

### 3. Add connectors to Claude
Go to Claude → Settings → Connectors → "+" → "Add custom connector" → paste each URL from `connector-urls.txt`.

## Alternative: Docker Compose (for VPS)
```bash
docker-compose up -d
```
Then put a reverse proxy (nginx/caddy) in front with HTTPS. Claude requires HTTPS.

## Known API Issues

- **ChannelDock**: Returns HTML instead of JSON. Support has been emailed.
- **FiveX**: No cancellations or ad spend endpoints. Date params ignored server-side (client-side filtering built in).
- **Mirakl**: 401 auth errors in scheduled tasks. Auth tokens need verification.
- **Import4you**: API endpoints are provisional — need verification with I4Y docs.
- **MarktMentor**: No API available (browser scraping only). Not built as connector.

## Architecture

Each connector is an independent Node.js TypeScript server using:
- `@modelcontextprotocol/sdk` — Official MCP TypeScript SDK
- `StreamableHTTPServerTransport` — HTTP transport for remote MCP
- `Express` — HTTP server
- `Zod` — Input validation

Claude connects to each server's `/mcp` endpoint from Anthropic's cloud infrastructure.

## File Structure

```
MCP Connectors/
├── docker-compose.yml        # Run all connectors together
├── deploy-all.sh             # One-command Railway deploy
├── test-apis.sh              # Test all API connections
├── README.md                 # This file
├── fivex-mcp-server/         # Port 3001
├── bolcom-retailer-mcp-server/   # Port 3002
├── returnless-mcp-server/    # Port 3003
├── mirakl-mcp-server/        # Port 3004
├── channeldock-mcp-server/   # Port 3005
├── bolcom-advertising-mcp-server/ # Port 3006
└── import4you-mcp-server/    # Port 3007
```

## Security Note

Credentials are in `.env` files and `docker-compose.yml`. After deploying:
1. Rotate any credentials that were shared in plain text
2. Use Railway/hosting platform's secret management instead of env files
3. Consider adding API key validation or OAuth to the MCP servers for production
