# ESCAP Data Explorer MCP Server

An MCP (Model Context Protocol) server that provides official statistical data for development indicators in Asia-Pacific. It wraps the ESCAP Data Explorer API, letting any MCP-compatible host query SDG and thematic data through natural language.

[![MCP](https://img.shields.io/badge/MCP-compatible-blue?logo=anthropic)](https://modelcontextprotocol.io)
[![SDMX](https://img.shields.io/badge/API-SDMX%20v2.1-orange)](https://sdmx.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen?logo=node.js)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-blue?logo=docker)](https://docker.com)

> **Live endpoint:** `https://dataexplorer.unescap.org/mcp/message`

---

## What is this?

The [ESCAP Data Explorer](https://dataexplorer.unescap.org) is the official statistical platform of the United Nations Economic and Social Commission for Asia and the Pacific (ESCAP). It publishes hundreds of SDG and thematic indicators covering poverty, gender, environment, health, trade, and more — across 58 Asia-Pacific countries and territories.

This MCP server wraps the ESCAP Data Explorer's [SDMX v2.1 REST API](http://api-dataexplorer.unescap.org/rest/) and exposes it as five structured tools that an AI agent can call in sequence to discover, validate, and retrieve statistical data — all through natural language.

---

## Example use cases

- *"What is the poverty headcount ratio in Thailand between 2010 and 2022?"*
- *"Show me SDG 5 gender equality indicators available for South Asia."*
- *"Compare CO₂ emissions per capita across ASEAN countries from 2000 to 2020."*
- *"Which Asia-Pacific countries have data on maternal mortality after 2015?"*
- *"Summarize progress on SDG 1 (No Poverty) for least developed countries."*

---

## Tools

The server exposes five tools that follow a guided workflow:

| Step | Tool | Description |
|------|------|-------------|
| 1 | `get_indicators` | Browse the full SDG & Thematic indicator hierarchy. Returns indicator codes and descriptions. |
| 2 | `get_indicator_metadata` | Fetch structural metadata (dimensions, attributes) for a chosen indicator in XML. |
| 3 | `get_countries` | List all 58 reference areas with their codes and full names. |
| 4 | `check_data_availability` | Confirm data exists for a given indicator, country, and year range before fetching. |
| 5 | `get_data` | Retrieve observation data in SDMX format for a given indicator, country, and period. |

---

## Quickstart — use the public endpoint

The server is already deployed and publicly accessible. No installation needed.

### Claude Desktop

Install [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) if you haven't already:

```bash
npm install -g mcp-remote
```

Add to your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "escap-data-explorer": {
      "command": "mcp-remote",
      "args": ["https://dataexplorer.unescap.org/mcp/message"]
    }
  }
}
```

Restart Claude Desktop. The five ESCAP tools will appear automatically.

### Other MCP clients (native Streamable HTTP)

```json
{
  "mcpServers": {
    "escap-data-explorer": {
      "url": "https://dataexplorer.unescap.org/mcp/message"
    }
  }
}
```

---

## Self-hosting

### Requirements

- Node.js 18 or later
- npm 8 or later
- Docker + Docker Compose (for server deployment)

### 1. Clone the repository

```bash
git clone https://github.com/your-org/escap-mcp.git
cd escap-mcp
```

### 2. Install and build

```bash
npm install
npm run build
```

### 3. Run locally (stdio mode — for development)

```bash
node dist/index.js
```

Test with Claude Desktop by pointing to the local binary:

```json
{
  "mcpServers": {
    "escap-data-explorer": {
      "command": "node",
      "args": ["/absolute/path/to/escap-mcp/dist/index.js"]
    }
  }
}
```

### 4. Deploy with Docker

Build the image:

```bash
docker build -t escap-mcp:latest .
docker compose up -d
```

Verify the server is running:

```bash
curl http://localhost:9000/health
# {"status":"ok","transport":"streamable-http","messagePath":"/message"}
```

---

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` for local dev, `http` for Docker/server |
| `PORT` | `9000` | HTTP port when `MCP_TRANSPORT=http` |
| `PATH_PREFIX` | `""` | Path prefix if your reverse proxy passes it through unchanged |

---

## Reverse proxy (Apache)

If deploying behind Apache, replace your `/mcp/` location block with the following. The key directive is `flushpackets=on`, which prevents Apache from buffering the streaming HTTP response:

```apache
<Location /mcp/>
    ProxyPass http://localhost:9000/ flushpackets=on flushwait=1
    ProxyPassReverse http://localhost:9000/

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"

    SetEnv no-gzip 1
    SetEnv dont-vary 1
</Location>
```

Required modules: `mod_proxy`, `mod_proxy_http`, `mod_headers`.

```bash
sudo a2enmod proxy proxy_http headers
sudo systemctl reload httpd
```

---

## API reference

This server connects to the ESCAP Data Explorer SDMX v2.1 REST API. The underlying endpoints used are:

| Purpose | Endpoint |
|---------|----------|
| Indicator hierarchy | `https://dataexplorer.unescap.org/search/api/search?tenant=demo` |
| Indicator metadata | `https://api-dataexplorer.unescap.org/rest/v2/data/dataflow/ESCAP/{type}_Dataflow/2.10/` |
| Country codelist | `https://api-dataexplorer.unescap.org/rest/codelist/escap/cl_ref_area` |
| Data availability | `https://api-dataexplorer.unescap.org/rest/availableconstraint/ESCAP,{type}_Dataflow,2.10/` |
| Data retrieval | `https://api-dataexplorer.unescap.org/rest/data/ESCAP,{type}_Dataflow,2.10/` |

Dataset types are either `SDG` (Sustainable Development Goals) or `Theme` (thematic indicators).

---

## Transport

The server implements the **Streamable HTTP** MCP transport (the current standard as of MCP SDK 1.x). Legacy SSE transport is not supported.

- **Endpoint:** `POST /message` — all client-to-server communication
- **Session management:** via `Mcp-Session-Id` request/response header
- **Server push:** `GET /message` with `Mcp-Session-Id` header

---

## Project structure

```
escap-mcp/
├── src/
│   └── index.ts          # All server logic (single file)
├── dist/                 # Compiled output (after npm run build)
├── Dockerfile            # Two-stage Alpine build
├── docker-compose.yml    # Production deployment
├── apache-mcp.conf       # Apache reverse proxy config snippet
├── tsconfig.json
└── package.json
```

---

## GitHub topic tags

Add these topics to your GitHub repository (Settings → Topics):

`mcp` `mcp-server` `model-context-protocol` `asia-pacific` `statistics` `open-data` `sdmx` `unescap` `sustainable-development-goals` `sdg`

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## About ESCAP

The [United Nations Economic and Social Commission for Asia and the Pacific (ESCAP)](https://www.unescap.org) is the regional development arm of the United Nations for the Asia-Pacific region. The ESCAP Data Explorer provides free, open access to official statistics from member states across economic, social, and environmental dimensions.
