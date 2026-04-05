# Bol.com Retailer MCP Server

Complete MCP server implementation for the Bol.com Retailer API, ready for integration with Claude.

## Files Created

1. **package.json** - Node.js dependencies and scripts
2. **tsconfig.json** - TypeScript configuration (ES2022, strict mode)
3. **.env** - Environment variables (CLIENT_ID, CLIENT_SECRET, PORT)
4. **.env.example** - Template for environment variables
5. **.gitignore** - Git ignore patterns
6. **Dockerfile** - Multi-stage Docker build
7. **src/bolcom-client.ts** - Bol.com API client with OAuth2 auth
8. **src/index.ts** - MCP server with Express, 6 registered tools

## Tools Available

- `get_orders` - Fetch recent orders (optional page parameter)
- `get_shipments` - Fetch shipments (optional page parameter)
- `get_returns` - Fetch returns (optional page, handled parameters)
- `get_offers` - Fetch product offers/listings (optional page parameter)
- `get_performance_indicators` - Get seller performance scores (name, year, week required)
- `get_reviews` - Fetch product reviews (optional page parameter)

## Setup

```bash
npm install
npm run build
npm run start
```

Or with development mode:

```bash
npm run dev
```

## Environment Variables

- `BOLCOM_CLIENT_ID` - OAuth2 Client ID
- `BOLCOM_CLIENT_SECRET` - OAuth2 Client Secret
- `PORT` - Server port (default 3002)

## API Features

- OAuth2 client credentials authentication
- Token caching with automatic refresh
- Rate limit handling with exponential backoff
- Proper error handling and logging
- Session-based client management
- Health check endpoint at `/health`

## Docker

```bash
docker build -t bolcom-retailer-mcp .
docker run -e BOLCOM_CLIENT_ID=... -e BOLCOM_CLIENT_SECRET=... -p 3002:3002 bolcom-retailer-mcp
```

## Integration with Claude

The server uses the MCP StreamableHTTPServerTransport pattern. Configure it as a custom connector in Claude with:
- Endpoint: `http://localhost:3002/mcp`
- Health check: `http://localhost:3002/health`
