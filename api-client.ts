/**
 * ESCAP SDMX REST API Client
 * Handles communication with api-dataexplorer.unescap.org
 */

import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";

const BASE_URL = "https://api-dataexplorer.unescap.org/rest";

export interface DataQuery {
  agency?: string;           // e.g. "ESCAP"
  dataflowId?: string;       // e.g. "SDG_Dataflow"
  version?: string;          // e.g. "2.10"
  key?: string;              // e.g. ".G14_0b_01..A" (dimension filter)
  startPeriod?: string;      // e.g. "2015"
  endPeriod?: string;        // e.g. "2025"
  dimensionAtObservation?: string; // e.g. "AllDimensions"
}

export interface DataflowQuery {
  agency?: string;
  dataflowId?: string;
  version?: string;
  references?: string;       // e.g. "all", "codelist", "none"
}

/**
 * Fetches SDMX data from the REST API and returns parsed JSON
 */
export async function fetchData(query: DataQuery): Promise<object> {
  const {
    agency = "ESCAP",
    dataflowId = "SDG_Dataflow",
    version = "2.10",
    key = "all",             // "all" = no filter
    startPeriod,
    endPeriod,
    dimensionAtObservation = "AllDimensions",
  } = query;

  const params = new URLSearchParams();
  if (startPeriod) params.set("startPeriod", startPeriod);
  if (endPeriod) params.set("endPeriod", endPeriod);
  params.set("dimensionAtObservation", dimensionAtObservation);

  const url = `${BASE_URL}/data/${agency},${dataflowId},${version}/${key}?${params}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText} — URL: ${url}`);
  }

  // Try JSON first; fall back to XML parsing
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    return (await response.json()) as object;
  }

  const text = await response.text();
  const parsed = await parseStringPromise(text, { explicitArray: false });
  return parsed;
}

/**
 * Fetches dataflow metadata (structure, codelists, concepts)
 */
export async function fetchDataflow(query: DataflowQuery): Promise<object> {
  const {
    agency = "ESCAP",
    dataflowId = "SDG_Dataflow",
    version = "2.10",
    references = "all",
  } = query;

  const url = `${BASE_URL}/dataflow/${agency}/${dataflowId}/${version}?references=${references}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText} — URL: ${url}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    return (await response.json()) as object;
  }

  const text = await response.text();
  const parsed = await parseStringPromise(text, { explicitArray: false });
  return parsed;
}

/**
 * Lists available dataflows for an agency
 */
export async function listDataflows(agency = "ESCAP"): Promise<object> {
  const url = `${BASE_URL}/dataflow/${agency}?references=none`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    return (await response.json()) as object;
  }

  const text = await response.text();
  return await parseStringPromise(text, { explicitArray: false });
}
