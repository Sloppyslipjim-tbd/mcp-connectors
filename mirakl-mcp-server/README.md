# Mirakl MCP Server

Complete MCP server for the Mirakl marketplace API supporting Decathlon, ANWB, and MediaMarkt.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build:
   ```bash
   npm run build
   ```

3. Run:
   ```bash
   npm start
   ```

Or for development with hot reload:
```bash
npm run dev
```

## Environment Variables

See `.env` for configuration. API keys and base URLs are pre-configured for:
- Decathlon
- ANWB
- MediaMarkt NL

## Exposed Tools

All tools accept a `marketplace` parameter: `decathlon`, `anwb`, or `mediamarkt`

- `get_orders`: Fetch orders by state (defaults: WAITING_ACCEPTANCE, SHIPPING)
- `get_offers`: Fetch product offers (OF21 endpoint)
- `get_messages`: Fetch inbox messages (M11 endpoint)
- `get_shipping_info`: Fetch shipping information (OR62 endpoint)

## Endpoints

- `GET /health`: Health check
- `POST /mcp`: MCP tool invocation
- `GET /mcp`: MCP session management
- `DELETE /mcp`: MCP cleanup

Default port: 3004

## Known Issues

- 401 authentication errors reported in scheduled tasks. Verify API keys in `.env` if this occurs.

## Docker

Build and run:
```bash
docker build -t mirakl-mcp-server .
docker run -p 3004:3004 --env-file .env mirakl-mcp-server
```
