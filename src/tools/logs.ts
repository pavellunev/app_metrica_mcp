import { z } from "zod";
import type { AppMetricaClient } from "../client.js";
import type { ServerAdapter } from "../server.js";
import { ok, err } from "../util.js";
import { LOGS_TABLES } from "../catalog.generated.js";

const LOGS_TABLE_NAMES = Object.keys(LOGS_TABLES) as [string, ...string[]];

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
  const wrapped = raw as unknown as { data?: unknown };
  if (wrapped && typeof wrapped === "object") {
    if (Array.isArray(wrapped.data)) return wrapped.data as unknown[];
    if (Object.keys(wrapped).length === 0) return []; // empty body (nothing exported)
  }
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
      profile_id: z.string().min(1).optional().describe("Exact user profile ID (server-side equality filter)"),
      fields: z.string().optional().describe(
        "Comma-separated fields to return. Defaults: event_name,event_datetime,event_json,appmetrica_device_id,app_version_name,os_version,device_model,country_iso_code,city"
      ),
      limit: z.number().optional().default(1000).describe("Maximum number of events to return (default 1000)"),
    },
    async (args) => {
      try {
        const { app_id, date_from, date_to, event_name, profile_id, fields, limit } = args as {
          app_id: number;
          date_from: string;
          date_to: string;
          event_name?: string;
          profile_id?: string;
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
        if (profile_id !== undefined) params.profile_id = profile_id;

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

  server.tool(
    "export_logs",
    `Export raw rows from any Logs API table: ${LOGS_TABLE_NAMES.join(", ")}.
Field names per table come from the official AppMetrica docs; unknown fields are rejected with the list of allowed ones. Default fields = all fields of the table.
date_from/date_to (YYYY-MM-DD) are required for every table except push_tokens, which takes no dates.
Same async/rate-limit behaviour as export_events: the wrapper re-polls 202 and honours Retry-After on 429. Run sequentially, start with 1-day windows and select only the fields you need. If exports keep queuing, check get_logs_api_status.`,
    {
      app_id: z.number().describe("AppMetrica application ID"),
      table: z.enum(LOGS_TABLE_NAMES).describe("Logs API table"),
      date_from: z.string().optional().describe("Start date YYYY-MM-DD (not used for push_tokens)"),
      date_to: z.string().optional().describe("End date YYYY-MM-DD (not used for push_tokens)"),
      fields: z.array(z.string()).optional().describe("Fields to return (default: all fields of the table)"),
      limit: z.number().optional().default(1000).describe("Maximum number of rows to return (default 1000)"),
    },
    async (args) => {
      try {
        const { app_id, table, date_from, date_to, fields, limit } = args as {
          app_id: number;
          table: string;
          date_from?: string;
          date_to?: string;
          fields?: string[];
          limit?: number;
        };

        const allowed = LOGS_TABLES[table];
        const selected = fields && fields.length > 0 ? fields : allowed;
        const unknown = selected.filter((f) => !allowed.includes(f));
        if (unknown.length > 0) {
          return err(`Unknown field(s) for table ${table}: ${unknown.join(", ")}. Allowed: ${allowed.join(", ")}`);
        }

        const params: Record<string, string | number> = {
          application_id: app_id,
          fields: selected.join(","),
          limit: limit ?? 1000,
        };

        if (table !== "push_tokens") {
          if (!date_from || !date_to) {
            return err(`date_from and date_to are required for table ${table}`);
          }
          params.date_since = toDatetime(date_from);
          params.date_until = toDatetimeEnd(date_to);
        }

        const rows = await exportLogs(client, table, params);
        return ok({ table, count: rows.length, rows });
      } catch (e) {
        return err(e);
      }
    }
  );
}
