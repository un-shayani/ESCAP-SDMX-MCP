#!/usr/bin/env node
/**
 * ESCAP Data Explorer MCP Server
 * Connects to the UNESCAP Data Explorer REST API (SDMX v2.1)
 * https://dataexplorer.unescap.org
 *
 * Supports two transports, selected via the MCP_TRANSPORT env var:
 *   MCP_TRANSPORT=http  → HTTP + SSE on PORT (default 9000)   ← used in Docker
 *   MCP_TRANSPORT=stdio → stdio (default for local dev)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import http from "http";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEARCH_API_BASE = "https://dataexplorer.unescap.org/search/api";
const REST_API_BASE = "https://api-dataexplorer.unescap.org/rest";

const PORT = parseInt(process.env.PORT ?? "9000", 10);
const TRANSPORT = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make an HTTP request and return body as text, throwing a rich error on failure. */
async function fetchText(url: string, accept?: string): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": "ESCAP-MCP-Server/1.0",
  };
  if (accept) headers["Accept"] = accept;

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (networkErr) {
    throw new McpError(
      ErrorCode.InternalError,
      `Network error fetching ${url}: ${String(networkErr)}`
    );
  }

  const body = await response.text();

  if (!response.ok) {
    throw new McpError(
      ErrorCode.InternalError,
      `HTTP ${response.status} ${response.statusText} from ${url}\nResponse body: ${body}`
    );
  }

  return body;
}

/** Parse XML-ish response to extract codelist entries as { id, name }[]. */
function parseCodelist(xml: string): Array<{ id: string; name: string }> {
  const items: Array<{ id: string; name: string }> = [];
  const codeRegex =
    /<(str|structure):Code\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/(str|structure):Code>/g;
  const nameRegex = /<(common:Name|Name)[^>]*>([^<]+)<\//;

  let match: RegExpExecArray | null;
  while ((match = codeRegex.exec(xml)) !== null) {
    const id = match[2];
    const inner = match[3];
    const nameMatch = nameRegex.exec(inner);
    const name = nameMatch ? nameMatch[2].trim() : id;
    items.push({ id, name });
  }
  return items;
}

/** Determine dataset type string from user-supplied type. */
function resolveDatasetType(datasetType: string): "SDG" | "Theme" {
  const t = datasetType.trim().toUpperCase();
  if (t === "SDG") return "SDG";
  if (t === "THEME" || t === "THEMATIC") return "Theme";
  throw new McpError(
    ErrorCode.InvalidParams,
    `Invalid datasetType "${datasetType}". Must be "SDG" or "Thematic".`
  );
}

// ---------------------------------------------------------------------------
// Tool schemas (Zod)
// ---------------------------------------------------------------------------

const GetIndicatorsSchema = z.object({});

const GetIndicatorMetadataSchema = z.object({
  indicatorCode: z
    .string()
    .describe("Indicator code (last part after # in val field)"),
  datasetType: z.string().describe('Dataset type: "SDG" or "Thematic"'),
});

const GetCountriesSchema = z.object({});

const CheckDataAvailabilitySchema = z.object({
  indicatorCode: z.string().describe("Indicator code"),
  datasetType: z.string().describe('Dataset type: "SDG" or "Thematic"'),
  countryId: z
    .string()
    .optional()
    .describe("Country/ref_area code (optional)"),
  startYear: z.number().int().describe("Start year (e.g. 2000)"),
  endYear: z.number().int().describe("End year (e.g. 2023)"),
});

const GetDataSchema = z.object({
  indicatorCode: z.string().describe("Indicator code"),
  datasetType: z.string().describe('Dataset type: "SDG" or "Thematic"'),
  countryId: z
    .string()
    .optional()
    .describe("Country/ref_area code (optional, leave blank for all)"),
  startYear: z.number().int().describe("Start year"),
  endYear: z.number().int().describe("End year"),
});

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function getIndicators(): Promise<string> {
  const url = `${SEARCH_API_BASE}/search?tenant=demo`;
  const raw = await fetchText(url, "application/json");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return `Raw response (could not parse as JSON):\n${raw}`;
  }

  interface SearchItem {
    val?: string;
    label?: string;
    title?: string;
    name?: string;
    children?: SearchItem[];
    [key: string]: unknown;
  }

  const lines: string[] = [];
  lines.push("Available Indicators from UNESCAP Data Explorer");
  lines.push("=".repeat(50));
  lines.push("");
  lines.push(
    "Browse the list below. The Indicator Code is the segment after the last # in the 'val' field."
  );
  lines.push(
    "Note whether the indicator belongs to 'SDG' or 'Thematic' datasets."
  );
  lines.push("");

  function walk(items: SearchItem[], depth = 0): void {
    for (const item of items) {
      const indent = "  ".repeat(depth);
      const label = item.label ?? item.title ?? item.name ?? "(no label)";
      const val = item.val ?? "";
      let code = "";
      if (val.includes("#")) {
        code = val.split("#").pop() ?? "";
      }
      const codePart = code ? ` [Code: ${code}]` : "";
      const valPart = val ? ` (val: ${val})` : "";
      lines.push(`${indent}- ${label}${codePart}${valPart}`);
      if (item.children && Array.isArray(item.children)) {
        walk(item.children as SearchItem[], depth + 1);
      }
    }
  }

  if (Array.isArray(parsed)) {
    walk(parsed as SearchItem[]);
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const candidates = ["data", "items", "results", "indicators", "children"];
    let found = false;
    for (const key of candidates) {
      if (Array.isArray(obj[key])) {
        walk(obj[key] as SearchItem[]);
        found = true;
        break;
      }
    }
    if (!found) {
      lines.push("Raw response structure:");
      lines.push(JSON.stringify(parsed, null, 2));
    }
  }

  return lines.join("\n");
}

async function getIndicatorMetadata(
  indicatorCode: string,
  datasetType: string
): Promise<string> {
  const dsType = resolveDatasetType(datasetType);
  const url =
    `${REST_API_BASE}/v2/data/dataflow/ESCAP/${dsType}_Dataflow/2.10/` +
    `*.${indicatorCode}.A?attributes=msd&measures=none&dimensionAtObservation=AllDimensions`;

  const raw = await fetchText(url, "application/xml");

  try {
    const parsed = JSON.parse(raw);
    return (
      `Metadata for indicator: ${indicatorCode} (${dsType} dataset)\n` +
      "=".repeat(50) +
      "\n" +
      JSON.stringify(parsed, null, 2)
    );
  } catch {
    return (
      `Metadata for indicator: ${indicatorCode} (${dsType} dataset)\n` +
      "=".repeat(50) +
      "\n" +
      raw
    );
  }
}

async function getCountries(): Promise<string> {
  const url = `${REST_API_BASE}/codelist/escap/cl_ref_area`;
  const raw = await fetchText(url, "application/vnd.sdmx.structure+xml");

  const items = parseCodelist(raw);

  if (items.length === 0) {
    return "Could not parse structured country list. Raw response:\n" + raw;
  }

  const lines: string[] = [];
  lines.push("Available Countries / Reference Areas");
  lines.push("=".repeat(40));
  lines.push(`${"Code".padEnd(12)} Name`);
  lines.push("-".repeat(60));
  for (const item of items) {
    lines.push(`${item.id.padEnd(12)} ${item.name}`);
  }
  lines.push("");
  lines.push(`Total: ${items.length} entries`);
  return lines.join("\n");
}

async function checkDataAvailability(
  indicatorCode: string,
  datasetType: string,
  countryId: string | undefined,
  startYear: number,
  endYear: number
): Promise<string> {
  const dsType = resolveDatasetType(datasetType);
  const url =
    `${REST_API_BASE}/availableconstraint/ESCAP,${dsType}_Dataflow,2.10/` +
    `.${indicatorCode}..A` +
    `?startPeriod=${startYear}&endPeriod=${endYear}` +
    `&dimensionAtObservation=AllDimensions&mode=available`;

  const raw = await fetchText(url, "application/vnd.sdmx.structure+xml");

  const refAreaMatch = raw.match(
    /id="REF_AREA"[^>]*>([\s\S]*?)<\/[\w:]*KeyValue>/
  );

  let availableCountries: string[] = [];
  if (refAreaMatch) {
    const inner = refAreaMatch[1];
    const valueMatches = [
      ...inner.matchAll(/<[\w:]*Value[^>]*>([^<]+)<\/[\w:]*Value>/g),
    ];
    availableCountries = valueMatches.map((m) => m[1].trim());
  } else {
    const allValues = [
      ...raw.matchAll(
        /<(?:\w+:)?Value[^>]*>([A-Z0-9_]+)<\/(?:\w+:)?Value>/g
      ),
    ];
    availableCountries = [...new Set(allValues.map((m) => m[1].trim()))];
  }

  const lines: string[] = [];
  lines.push(`Data Availability Check`);
  lines.push("=".repeat(40));
  lines.push(`Indicator:   ${indicatorCode}`);
  lines.push(`Dataset:     ${dsType}`);
  lines.push(`Period:      ${startYear}–${endYear}`);
  lines.push("");

  if (countryId && countryId.trim() !== "") {
    const cid = countryId.trim().toUpperCase();
    const found = availableCountries.some((c) => c.toUpperCase() === cid);
    if (found) {
      lines.push(`✅ Data IS available for country: ${cid}`);
    } else {
      lines.push(`❌ Data is NOT available for country: ${cid}`);
      lines.push("");
      lines.push("Countries with available data in this period:");
      if (availableCountries.length > 0) {
        lines.push(availableCountries.join(", "));
      } else {
        lines.push("(none found — the dataset may be empty for this period)");
      }
    }
  } else {
    lines.push("All countries with available data in this period:");
    if (availableCountries.length > 0) {
      lines.push(availableCountries.join(", "));
      lines.push(`\nTotal: ${availableCountries.length} countries`);
    } else {
      lines.push("(none found — the dataset may be empty for this period)");
      lines.push("\nRaw response for debugging:");
      lines.push(raw.substring(0, 2000));
    }
  }

  return lines.join("\n");
}

async function getData(
  indicatorCode: string,
  datasetType: string,
  countryId: string | undefined,
  startYear: number,
  endYear: number
): Promise<string> {
  const dsType = resolveDatasetType(datasetType);
  const country = countryId?.trim() ?? "";
  const url =
    `${REST_API_BASE}/data/ESCAP,${dsType}_Dataflow,2.10/` +
    `${country}.${indicatorCode}..A` +
    `?startPeriod=${startYear}&endPeriod=${endYear}` +
    `&dimensionAtObservation=AllDimensions`;

  const raw = await fetchText(url);

  const header =
    `Data for indicator: ${indicatorCode} (${dsType})\n` +
    `Country: ${country || "all"} | Period: ${startYear}–${endYear}\n` +
    "=".repeat(60) +
    "\n\n";

  try {
    const parsed = JSON.parse(raw);
    return header + JSON.stringify(parsed, null, 2);
  } catch {
    return header + raw;
  }
}

// ---------------------------------------------------------------------------
// MCP Server definition
// ---------------------------------------------------------------------------

function createServer(): Server {
  const server = new Server(
    { name: "escap-data-explorer", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_indicators",
        description:
          "Step 1: Retrieve the full hierarchy of available SDG and Thematic indicators from UNESCAP Data Explorer. " +
          "Browse the results and choose ONE indicator. The indicator code is the segment after the last # in the 'val' field. " +
          "Only use indicator codes returned by this tool — do not invent or source codes from elsewhere.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "get_indicator_metadata",
        description:
          "Step 2: Retrieve metadata (dimensions, attributes, structure) for a specific indicator. " +
          "Call this after choosing an indicator from get_indicators.",
        inputSchema: {
          type: "object",
          properties: {
            indicatorCode: {
              type: "string",
              description: "Indicator code (last segment after # in val field)",
            },
            datasetType: {
              type: "string",
              description: 'Dataset type: "SDG" or "Thematic"',
            },
          },
          required: ["indicatorCode", "datasetType"],
        },
      },
      {
        name: "get_countries",
        description:
          "Step 3: Retrieve the full list of countries and reference areas available in UNESCAP Data Explorer, " +
          "including their codes (id) and names. Use these codes when checking availability or fetching data.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "check_data_availability",
        description:
          "Step 4: Check whether data is available for a given indicator, country, and time period. " +
          "Returns a list of countries with available data, or confirms/denies availability for a specific country. " +
          "If no country is specified, lists all countries with data in the period.",
        inputSchema: {
          type: "object",
          properties: {
            indicatorCode: { type: "string", description: "Indicator code" },
            datasetType: {
              type: "string",
              description: 'Dataset type: "SDG" or "Thematic"',
            },
            countryId: {
              type: "string",
              description:
                "Country/ref_area code from get_countries (optional — omit for all countries)",
            },
            startYear: {
              type: "number",
              description: "Start year (e.g. 2000)",
            },
            endYear: { type: "number", description: "End year (e.g. 2023)" },
          },
          required: ["indicatorCode", "datasetType", "startYear", "endYear"],
        },
      },
      {
        name: "get_data",
        description:
          "Step 5: Retrieve actual data for a given indicator, optional country, and time period. " +
          "Returns SDMX data (JSON or XML) including observation values, time periods, and attributes. " +
          "It is recommended to call check_data_availability first to confirm data exists.",
        inputSchema: {
          type: "object",
          properties: {
            indicatorCode: { type: "string", description: "Indicator code" },
            datasetType: {
              type: "string",
              description: 'Dataset type: "SDG" or "Thematic"',
            },
            countryId: {
              type: "string",
              description:
                "Country/ref_area code (optional — omit for all countries)",
            },
            startYear: { type: "number", description: "Start year" },
            endYear: { type: "number", description: "End year" },
          },
          required: ["indicatorCode", "datasetType", "startYear", "endYear"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case "get_indicators":
          result = await getIndicators();
          break;

        case "get_indicator_metadata": {
          const p = GetIndicatorMetadataSchema.parse(args);
          result = await getIndicatorMetadata(p.indicatorCode, p.datasetType);
          break;
        }

        case "get_countries":
          result = await getCountries();
          break;

        case "check_data_availability": {
          const p = CheckDataAvailabilitySchema.parse(args);
          result = await checkDataAvailability(
            p.indicatorCode,
            p.datasetType,
            p.countryId,
            p.startYear,
            p.endYear
          );
          break;
        }

        case "get_data": {
          const p = GetDataSchema.parse(args);
          result = await getData(
            p.indicatorCode,
            p.datasetType,
            p.countryId,
            p.startYear,
            p.endYear
          );
          break;
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      if (err instanceof McpError) throw err;
      if (err instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid parameters: ${err.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; ")}`
        );
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Unexpected error: ${String(err)}`
      );
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Transport — stdio (local dev) or Streamable HTTP (Docker / remote)
// ---------------------------------------------------------------------------

async function startStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ESCAP MCP Server running on stdio");
}

async function startHttp(): Promise<void> {
  // Apache config: ProxyPass /mcp/ http://localhost:9000/
  // The trailing slash means Apache STRIPS /mcp before forwarding to the container.
  // So the container receives paths like /message, /health (no /mcp prefix).
  //
  // Streamable HTTP uses a single endpoint for everything (POST /message).
  // Sessions are managed via Mcp-Session-Id headers, not query params.
  const pathPrefix   = (process.env.PATH_PREFIX ?? "").replace(/\/$/, ""); // "" for current Apache setup
  const messagePath  = `${pathPrefix}/message`;
  const healthPath   = `${pathPrefix}/health`;

  // Map of sessionId → StreamableHTTPServerTransport (one per client session)
  const transports = new Map<string, StreamableHTTPServerTransport>();

  function pathname(url: string | undefined): string {
    if (!url) return "/";
    const q = url.indexOf("?");
    return q === -1 ? url : url.slice(0, q);
  }

  const httpServer = http.createServer(async (req, res) => {
    const path = pathname(req.url);

    // Log every incoming request to aid debugging
    console.error(`[HTTP] ${req.method} ${req.url}`);

    // ── Health check ──────────────────────────────────────────────────────────
    if (req.method === "GET" && path === healthPath) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "streamable-http", messagePath }));
      return;
    }

    // ── Streamable HTTP message endpoint ──────────────────────────────────────
    // All MCP communication (initialize, tools/list, tools/call, etc.) goes
    // through POST /message. GET /message opens a server-sent event stream for
    // server-to-client pushes. DELETE /message terminates a session.
    if (path === messagePath) {

      // ── POST: client → server (initialize, tool calls, …) ─────────────────
      if (req.method === "POST") {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        // Existing session: route to the right transport
        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!;
          await transport.handleRequest(req, res);
          return;
        }

        // No session yet: this must be the initialize request — create a new one
        if (!sessionId) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (id) => {
              transports.set(id, transport);
              console.error(`[MCP] Session created: ${id}`);
            },
          });

          transport.onclose = () => {
            const id = transport.sessionId;
            if (id) {
              transports.delete(id);
              console.error(`[MCP] Session closed: ${id}`);
            }
          };

          const server = createServer();
          await server.connect(transport);
          await transport.handleRequest(req, res);
          return;
        }

        // Has a session ID but it's unknown — reject
        console.error(`[MCP] Unknown session: ${sessionId}`);
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Unknown session: ${sessionId}` }));
        return;
      }

      // ── GET: open SSE stream for server-initiated messages ─────────────────
      if (req.method === "GET") {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (!sessionId || !transports.has(sessionId)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing or unknown Mcp-Session-Id header" }));
          return;
        }
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      // ── DELETE: client explicitly closes a session ─────────────────────────
      if (req.method === "DELETE") {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!;
          await transport.handleRequest(req, res);
          transports.delete(sessionId);
          console.error(`[MCP] Session deleted: ${sessionId}`);
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session not found" }));
        }
        return;
      }
    }

    // ── 404 ───────────────────────────────────────────────────────────────────
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Not found",
      receivedPath: path,
      expectedPaths: [messagePath, healthPath],
    }));
  });

  httpServer.listen(PORT, () => {
    console.error(`ESCAP MCP Server (Streamable HTTP) listening on http://0.0.0.0:${PORT}`);
    console.error(`  Message endpoint: http://0.0.0.0:${PORT}${messagePath}`);
    console.error(`  Health check:     http://0.0.0.0:${PORT}${healthPath}`);
    if (pathPrefix) {
      console.error(`  Path prefix:      ${pathPrefix}  (PATH_PREFIX env var)`);
    }
  });
}

async function main(): Promise<void> {
  if (TRANSPORT === "http") {
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
