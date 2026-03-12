/**
 * ESCAP SDG MCP Server — MVP
 *
 * Exposes ESCAP SDMX REST API as MCP tools so any MCP-compatible
 * host (Claude Desktop, Claude Code, etc.) can query SDG data
 * through natural language.
 *
 * Tools exposed:
 *   1. get_sdg_data        — fetch indicator observations
 *   2. get_dataflow_info   — fetch structure/metadata for a dataflow
 *   3. list_dataflows      — list all available dataflows for an agency
 *   4. build_data_url      — construct a data URL without fetching
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fetchData, fetchDataflow, listDataflows } from "./api-client.js";

// ─── Server Initialisation ───────────────────────────────────────────────────

const server = new Server(
  {
    name: "escap-sdg-server",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

// ─── Tool Definitions ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_sdg_data",
        description:
          "Fetch SDG indicator observations from the ESCAP Data Explorer. " +
          "Returns time-series data filtered by indicator code, country, and period. " +
          "Use this to answer questions like 'Show me SDG indicator X for country Y from 2015 to 2023'.",
        inputSchema: {
          type: "object",
          properties: {
            agency: {
              type: "string",
              description: "Data provider agency code (default: ESCAP)",
              default: "ESCAP",
            },
            dataflowId: {
              type: "string",
              description: "Dataflow identifier (default: SDG_Dataflow)",
              default: "SDG_Dataflow",
            },
            version: {
              type: "string",
              description: "Dataflow version (default: 2.10)",
              default: "2.10",
            },
            key: {
              type: "string",
              description:
                "SDMX dimension key filter. Dot-separated dimension values. " +
                "Use empty segments to match all values. " +
                "Example: '.G14_0b_01..A' or 'all' for no filter.",
              default: "all",
            },
            startPeriod: {
              type: "string",
              description: "Start year (e.g. '2015')",
            },
            endPeriod: {
              type: "string",
              description: "End year (e.g. '2025')",
            },
          },
          required: [],
        },
      },

      {
        name: "get_dataflow_info",
        description:
          "Retrieve structural metadata for a specific dataflow: dimensions, " +
          "codelists, concept schemes, and constraints. " +
          "Use this to understand what indicator codes, country codes, or " +
          "frequency codes are valid for a given dataflow.",
        inputSchema: {
          type: "object",
          properties: {
            agency: {
              type: "string",
              description: "Agency code (default: ESCAP)",
              default: "ESCAP",
            },
            dataflowId: {
              type: "string",
              description: "Dataflow ID (default: SDG_Dataflow)",
              default: "SDG_Dataflow",
            },
            version: {
              type: "string",
              description: "Version (default: 2.10)",
              default: "2.10",
            },
            references: {
              type: "string",
              description:
                "What related artefacts to include: 'all', 'codelist', 'conceptscheme', 'none' (default: all)",
              default: "all",
            },
          },
          required: [],
        },
      },

      {
        name: "list_dataflows",
        description:
          "List all dataflows available from an agency. " +
          "Use this to discover what datasets are available before querying data.",
        inputSchema: {
          type: "object",
          properties: {
            agency: {
              type: "string",
              description: "Agency code (default: ESCAP)",
              default: "ESCAP",
            },
          },
          required: [],
        },
      },

      {
        name: "build_data_url",
        description:
          "Construct the full REST API URL for a data query without fetching it. " +
          "Useful for sharing or debugging queries.",
        inputSchema: {
          type: "object",
          properties: {
            agency: { type: "string", default: "ESCAP" },
            dataflowId: { type: "string", default: "SDG_Dataflow" },
            version: { type: "string", default: "2.10" },
            key: { type: "string", default: "all" },
            startPeriod: { type: "string" },
            endPeriod: { type: "string" },
            dimensionAtObservation: { type: "string", default: "AllDimensions" },
          },
          required: [],
        },
      },
    ],
  };
});

// ─── Tool Handlers ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── 1. get_sdg_data ──────────────────────────────────────────────────
      case "get_sdg_data": {
        const data = await fetchData({
          agency: (args?.agency as string) ?? "ESCAP",
          dataflowId: (args?.dataflowId as string) ?? "SDG_Dataflow",
          version: (args?.version as string) ?? "2.10",
          key: (args?.key as string) ?? "all",
          startPeriod: args?.startPeriod as string | undefined,
          endPeriod: args?.endPeriod as string | undefined,
          dimensionAtObservation:
            (args?.dimensionAtObservation as string) ?? "AllDimensions",
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      // ── 2. get_dataflow_info ─────────────────────────────────────────────
      case "get_dataflow_info": {
        const info = await fetchDataflow({
          agency: (args?.agency as string) ?? "ESCAP",
          dataflowId: (args?.dataflowId as string) ?? "SDG_Dataflow",
          version: (args?.version as string) ?? "2.10",
          references: (args?.references as string) ?? "all",
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      }

      // ── 3. list_dataflows ────────────────────────────────────────────────
      case "list_dataflows": {
        const list = await listDataflows((args?.agency as string) ?? "ESCAP");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(list, null, 2),
            },
          ],
        };
      }

      // ── 4. build_data_url ────────────────────────────────────────────────
      case "build_data_url": {
        const agency = (args?.agency as string) ?? "ESCAP";
        const dataflowId = (args?.dataflowId as string) ?? "SDG_Dataflow";
        const version = (args?.version as string) ?? "2.10";
        const key = (args?.key as string) ?? "all";
        const dim =
          (args?.dimensionAtObservation as string) ?? "AllDimensions";

        const params = new URLSearchParams();
        if (args?.startPeriod) params.set("startPeriod", args.startPeriod as string);
        if (args?.endPeriod) params.set("endPeriod", args.endPeriod as string);
        params.set("dimensionAtObservation", dim);

        const url = `https://api-dataexplorer.unescap.org/rest/data/${agency},${dataflowId},${version}/${key}?${params}`;

        return {
          content: [
            {
              type: "text",
              text: url,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ESCAP SDG MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
