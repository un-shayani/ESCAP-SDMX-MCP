# ESCAP SDG MCP Server — MVP

An MCP (Model Context Protocol) server that wraps the ESCAP SDMX REST API,
letting any MCP-compatible host (Claude Desktop, Claude Code, etc.) query
SDG data through natural language.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Host (Claude Desktop / Claude Code / any MCP client)   │
└────────────────────────┬────────────────────────────────────┘
                         │  MCP Protocol (JSON-RPC over stdio)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   escap-sdg-mcp-server                      │
│                                                             │
│   src/index.ts          — MCP server + tool handlers        │
│   src/api-client.ts     — SDMX REST API wrapper             │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTPS REST (SDMX 2.1 / 3.0)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         api-dataexplorer.unescap.org/rest/...               │
└─────────────────────────────────────────────────────────────┘
```

### Key components

| File | Role |
|---|---|
| `src/index.ts` | MCP Server — registers tools, handles requests |
| `src/api-client.ts` | Thin HTTP client — constructs URLs, parses XML/JSON |
| `package.json` | ESM Node project, MCP SDK dependency |
| `tsconfig.json` | TypeScript config targeting ES2022 |

---

## MCP Tools Exposed

| Tool | Description |
|---|---|
| `get_sdg_data` | Fetch indicator time-series observations |
| `get_dataflow_info` | Get metadata: dimensions, codelists, concepts |
| `list_dataflows` | List all available datasets for an agency |
| `build_data_url` | Construct a query URL without fetching |

---

## Setup & Installation

### Prerequisites
- Node.js 18+
- npm or pnpm

### Steps

```bash
# 1. Clone / copy the project
cd escap-mcp-server

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Test manually
node dist/index.js
# Server starts and waits on stdin — Ctrl+C to exit
```

---

## Integration with Claude Desktop

Add this block to your Claude Desktop config file.

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "escap-sdg": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/escap-mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You should see the ESCAP tools available.

---

## Integration with Claude Code

Run inline:

```bash
claude mcp add escap-sdg node /absolute/path/to/dist/index.js
```

Or add to `.claude/settings.json` in your project:

```json
{
  "mcpServers": {
    "escap-sdg": {
      "command": "node",
      "args": ["/absolute/path/to/escap-mcp-server/dist/index.js"]
    }
  }
}
```

---

## Example Prompts (after connection)

Once connected to an MCP host, try:

```
Fetch SDG indicator G14_0b_01 data from 2015 to 2025
```

```
List all available dataflows from ESCAP
```

```
Show me the structure and dimensions of the SDG_Dataflow dataflow
```

```
Build the API URL for indicator G14_0b_01, annual frequency, 2018–2023
```

---

## API URL Patterns

### Data endpoint
```
GET /rest/data/{agency},{dataflowId},{version}/{key}
    ?startPeriod=YYYY
    &endPeriod=YYYY
    &dimensionAtObservation=AllDimensions
```

### Dataflow/structure endpoint
```
GET /rest/dataflow/{agency}/{dataflowId}/{version}
    ?references=all
```

### Key format (SDMX dimension filter)
```
.G14_0b_01..A
 ^           ^--- Frequency (A=Annual)
 |--- Leading dot = "all" for first dimension
             ^--- Two dots = "all" for middle dimensions
```

---

## Extending the MVP

Ideas for next steps:

1. **Caching** — Add in-memory or Redis cache for dataflow metadata (rarely changes)
2. **Response slimming** — Parse SDMX-JSON into a clean table before returning to the LLM
3. **Country filtering** — Add a dedicated `get_data_by_country` tool with ISO 3166 code lookup
4. **Pagination** — Handle large responses by streaming or chunking
5. **Auth** — Add API key header support if the endpoint requires authentication
6. **MCP Resources** — Expose codelists as MCP Resources so the LLM can browse them
7. **MCP Prompts** — Register prompt templates like "compare_countries" or "trend_analysis"

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module` | Run `npm run build` first |
| `API error 404` | Check agency/dataflowId/version in your query |
| XML response instead of JSON | Normal — api-client.ts auto-parses XML via xml2js |
| Server not appearing in Claude | Check absolute path in config; restart Claude |
