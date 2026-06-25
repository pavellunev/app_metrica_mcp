import { z } from "zod";
import type { AppMetricaClient } from "../client.js";
import type { ServerAdapter, ToolResult } from "../server.js";

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
  };
}

const DEFAULT_EVENT_FIELDS = [
  "event_name",
  "event_datetime",
  "event_json",
  "appmetrica_device_id",
  "app_version_name",
  "os_version",
  "device_model",
  "country_iso_code",
  "city",
].join(",");

const DEFAULT_CRASH_FIELDS = [
  "crash_name",
  "crash_datetime",
  "crash_receive_datetime",
  "appmetrica_device_id",
  "app_version_name",
  "os_version",
  "device_model",
  "country_iso_code",
].join(",");

const DEFAULT_INSTALLATION_FIELDS = [
  "installation_id",
  "install_datetime",
  "appmetrica_device_id",
  "app_version_name",
  "os_version",
  "device_model",
  "country_iso_code",
  "city",
].join(",");

// AppMetrica Logs API requires datetime format: "YYYY-MM-DD HH:MM:SS"
function toDatetime(date: string): string {
  return date.includes(" ") || date.includes("T") ? date : `${date} 00:00:00`;
}

function toDatetimeEnd(date: string): string {
  return date.includes(" ") || date.includes("T") ? date : `${date} 23:59:59`;
}

async function exportLogs(
  client: AppMetricaClient,
  type: string,
  params: Record<string, string | number>
): Promise<unknown[]> {
  const raw = await client.get<string>(`/logs/v1/export/${type}.json`, params);

  if (typeof raw === "string") {
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as unknown);
  }

  if (Array.isArray(raw)) return raw as unknown[];
  return [raw];
}

export function registerLogTools(server: ServerAdapter, client: AppMetricaClient): void {
  server.tool(
    "export_events",
    `Export raw event logs from AppMetrica Logs API.
Revenue and in-app purchase data is stored in the event_json field as structured JSON.
Default fields: event_name, event_datetime, event_json, appmetrica_device_id, app_version_name, os_version, device_model, country_iso_code, city.
To get subscription/purchase data: filter by event_name (e.g. "subscription_purchase") and parse event_json field.

Logs API is asynchronous — the first request usually returns "data not ready" (HTTP 202) and the wrapper re-polls the same query (default budget ~150s, tunable via APPMETRICA_MAX_WAIT_MS). A busy or wide query may still need a manual retry after a few minutes; re-running the identical query resumes the same server-side export.
Start with 1-day windows; multi-day exports take noticeably longer to materialise.
Run export_events strictly sequentially and avoid rapid retries — the Logs API has a low export-request quota; on HTTP 429 the wrapper honours Retry-After and backs off, but exhausting the quota also blocks the AppMetrica web UI for a few minutes.`,
    {
      app_id: z.number().describe("AppMetrica application ID"),
      date_from: z.string().describe("Start date YYYY-MM-DD"),
      date_to: z.string().describe("End date YYYY-MM-DD"),
      event_name: z.string().optional().describe("Filter by specific event name (e.g. subscription_purchase)"),
      fields: z.string().optional().describe(
        "Comma-separated fields to return. Defaults: event_name,event_datetime,event_json,appmetrica_device_id,app_version_name,os_version,device_model,country_iso_code,city"
      ),
      limit: z.number().optional().default(1000).describe("Maximum number of events to return (default 1000)"),
    },
    async (args) => {
      try {
        const { app_id, date_from, date_to, event_name, fields, limit } = args as {
          app_id: number;
          date_from: string;
          date_to: string;
          event_name?: string;
          fields?: string;
          limit: number;
        };

        const params: Record<string, string | number> = {
          application_id: app_id,
          date_since: toDatetime(date_from),
          date_until: toDatetimeEnd(date_to),
          fields: fields ?? DEFAULT_EVENT_FIELDS,
          limit: limit ?? 1000,
        };

        if (event_name) params.event_name = event_name;

        const rows = await exportLogs(client, "events", params);
        return ok({ count: rows.length, events: rows });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "export_crashes",
    `Export raw crash logs from AppMetrica for a given application and time range.
Use this for per-crash-name breakdowns — get_report only exposes the total ym:cr:crashes count.
Same async/rate-limit behaviour as export_events: the wrapper re-polls 202 (default ~150s budget), honours Retry-After on 429, and backs off. Run sequentially and avoid rapid retries — wide ranges may need a manual retry after a few minutes.`,
    {
      app_id: z.number().describe("AppMetrica application ID"),
      date_from: z.string().describe("Start date YYYY-MM-DD"),
      date_to: z.string().describe("End date YYYY-MM-DD"),
      fields: z.string().optional().describe(
        "Comma-separated fields to return. Defaults: crash_name,crash_datetime,crash_receive_datetime,appmetrica_device_id,app_version_name,os_version,device_model,country_iso_code"
      ),
      limit: z.number().optional().default(1000).describe("Maximum number of crash records to return"),
    },
    async (args) => {
      try {
        const { app_id, date_from, date_to, fields, limit } = args as {
          app_id: number;
          date_from: string;
          date_to: string;
          fields?: string;
          limit: number;
        };

        const params: Record<string, string | number> = {
          application_id: app_id,
          date_since: toDatetime(date_from),
          date_until: toDatetimeEnd(date_to),
          fields: fields ?? DEFAULT_CRASH_FIELDS,
          limit: limit ?? 1000,
        };

        const rows = await exportLogs(client, "crashes", params);
        return ok({ count: rows.length, crashes: rows });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "export_installations",
    `Export raw installation logs from AppMetrica for a given application and time range.
Same async/rate-limit behaviour as export_events: the wrapper re-polls 202 (default ~150s budget), honours Retry-After on 429, and backs off. Run sequentially and avoid rapid retries — wide ranges may need a manual retry after a few minutes.`,
    {
      app_id: z.number().describe("AppMetrica application ID"),
      date_from: z.string().describe("Start date YYYY-MM-DD"),
      date_to: z.string().describe("End date YYYY-MM-DD"),
      fields: z.string().optional().describe(
        "Comma-separated fields to return. Defaults: installation_id,install_datetime,appmetrica_device_id,app_version_name,os_version,device_model,country_iso_code,city"
      ),
      limit: z.number().optional().default(1000).describe("Maximum number of installation records to return"),
    },
    async (args) => {
      try {
        const { app_id, date_from, date_to, fields, limit } = args as {
          app_id: number;
          date_from: string;
          date_to: string;
          fields?: string;
          limit: number;
        };

        const params: Record<string, string | number> = {
          application_id: app_id,
          date_since: toDatetime(date_from),
          date_until: toDatetimeEnd(date_to),
          fields: fields ?? DEFAULT_INSTALLATION_FIELDS,
          limit: limit ?? 1000,
        };

        const rows = await exportLogs(client, "installations", params);
        return ok({ count: rows.length, installations: rows });
      } catch (e) {
        return err(e);
      }
    }
  );
}
