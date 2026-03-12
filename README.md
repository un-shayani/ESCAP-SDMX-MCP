# ESCAP Data Explorer MCP Server

An MCP (Model Context Protocol) server that connects AI agents to the [UNESCAP Data Explorer](https://dataexplorer.unescap.org), which exposes statistical data via the **SDMX v2.1 REST API** developed by the European Commission.

## Features

Five tools following the recommended workflow:

| Step | Tool | Description |
|------|------|-------------|
| 1 | `get_indicators` | Browse the full SDG & Thematic indicator hierarchy |
| 2 | `get_indicator_metadata` | Fetch structure/dimensions for a chosen indicator |
| 3 | `get_countries` | List all available countries and reference area codes |
| 4 | `check_data_availability` | Confirm data exists before fetching |
| 5 | `get_data` | Retrieve data as SDMX CSV |

---

## Requirements

- **Node.js** v18 or later (for native `fetch` support)
- **npm** v8 or later

---

## Installation

### 1. Clone or download

```bash
git clone <your-repo-url> escap-mcp
cd escap-mcp
```

Or if you downloaded a zip, extract it and `cd` into the folder.

### 2. Install dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build
```

This compiles TypeScript to `dist/index.js`.

### 4. Verify

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

You should see a JSON response listing all 5 tools.

---

## Configuration in Claude Desktop

Open your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server under `mcpServers`:

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

Replace `/absolute/path/to/escap-mcp` with the actual path where you cloned/extracted the project.

Restart Claude Desktop. You should see the ESCAP tools available.

---

## Configuration in other MCP clients

For any MCP-compatible client, use:

```json
{
  "command": "node",
  "args": ["dist/index.js"],
  "cwd": "/path/to/escap-mcp"
}
```

---

## Recommended Agent Workflow

Agents should follow these steps in order:

### Step 1 — Browse indicators
```
Use tool: get_indicators
```
Returns the full SDG + Thematic indicator hierarchy. Browse to find a relevant indicator. The **indicator code** is the last segment after `#` in the `val` field. **Only use codes returned by this tool.**

### Step 2 — Inspect indicator metadata
```
Use tool: get_indicator_metadata
  indicatorCode: "SI_POV_DAY1"   ← example
  datasetType: "SDG"             ← "SDG" or "Thematic"
```
Returns dimensions, attributes, and structural metadata for the indicator.

### Step 3 — Get country codes
```
Use tool: get_countries
```
Returns a table of all countries with their `id` codes (e.g. `CHN`, `IND`, `THA`) and full names.

### Step 4 — Check data availability
```
Use tool: check_data_availability
  indicatorCode: "SI_POV_DAY1"
  datasetType: "SDG"
  countryId: "THA"    ← optional; omit for all countries
  startYear: 2010
  endYear: 2022
```
Returns whether data is available for the requested country/period, plus a list of all countries that have data.

### Step 5 — Fetch data
```
Use tool: get_data
  indicatorCode: "SI_POV_DAY1"
  datasetType: "SDG"
  countryId: "THA"    ← optional
  startYear: 2010
  endYear: 2022
```
Returns data in SDMX CSV format with all dimensions and observation values.

---

## API Endpoints Used

| Purpose | Endpoint |
|---------|----------|
| Indicator search | `https://dataexplorer.unescap.org/search/api/search?tenant=demo` |
| Indicator metadata | `https://api-dataexplorer.unescap.org/rest/v2/data/dataflow/ESCAP/{type}_Dataflow/2.10/` |
| Country codelist | `https://api-dataexplorer.unescap.org/rest/codelist/escap/cl_ref_area` |
| Data availability | `https://api-dataexplorer.unescap.org/rest/availableconstraint/ESCAP,{type}_Dataflow,2.10/` |
| Data retrieval | `https://api-dataexplorer.unescap.org/rest/data/ESCAP,{type}_Dataflow,2.10/` |

Base REST API: `http://api-dataexplorer.unescap.org/rest/` (SDMX v2.1, European Commission standard)

---

## Error Handling

All errors include:
- **HTTP status code** (e.g. `HTTP 404 Not Found`)
- **Full API error response body** for debugging
- **Parameter validation errors** with field-level messages

Example error message:
```
HTTP 404 Not Found from https://api-dataexplorer.unescap.org/rest/...
Response body: <?xml version="1.0"?>
<Error ... >No data found for the requested filter</Error>
```

---

## Development

```bash
# Type-check without building
npx tsc --noEmit

# Watch mode (requires ts-node)
npm run dev

# Build for production
npm run build
```

### Project structure

```
escap-mcp/
├── src/
│   └── index.ts        ← All server logic (single file)
├── dist/               ← Compiled output (after npm run build)
│   └── index.js
├── package.json
├── tsconfig.json
└── README.md
```

---

## License

MIT
