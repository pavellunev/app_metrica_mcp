import { z } from "zod";
import type { AppMetricaClient } from "../client.js";
import type { ServerAdapter, ToolResult } from "../server.js";

// AppMetrica Reports API does not publish a public metadata endpoint, and
// docs.appmetrica.yandex.com is gated behind SmartCaptcha. The catalogue
// below is assembled from three sources:
//   1. Live calls against the API (status: "verified", tested 2026-05-06).
//   2. Examples in official AppMetrica docs and the third-party R client
//      `appmetricaR` (status: "documented" — likely valid, not yet probed).
//   3. Known-bad keys are listed in the inline notes so callers don't repeat
//      the same mistake.
//
// Namespace grammar (per AppMetrica docs intro / segmentation page):
//   ym:ge:*  general / mobmet events — canonical "any activity" prefix
//   ym:ce:*  client events (event-sent context)
//   ym:u:*   users (AppMetrica-specific alias; works in practice)
//   ym:s:*   sessions
//   ym:cr:*  crashes
//   ym:i:*   installs / install-side tracker dims and metrics
//   ym:c:*   clicks / click-side tracker dims and metrics
//   ym:pc:*  push campaigns
//
// Constraint: AppMetrica docs say "you can't use different prefixes in the
// same request, though you can specify a different prefix when using the
// filters parameter." In practice mixing ym:u:/ym:s:/ym:cr: in one metrics=
// call has been observed to work, but mixing more distant namespaces
// (e.g. ym:ge: + ym:pc:) is likely to fail — keep one prefix per call.
//
// Not available via get_report at all (use Logs API or AppMetrica UI):
//   - revenue, purchasers, ARPU              -> export_events with event_json
//   - retention (D1/D7/D30)                  -> AppMetrica UI only
//   - per-user push opens                    -> only device-level via ym:pc:*
//   - per-event or per-crash-name aggregates -> export_events / export_crashes
//   - crashRate / affectedUsers              -> compute manually from raw counts

type MetricEntry = {
  key: string;
  description: string;
  status: "verified" | "documented";
};

const METRICS: MetricEntry[] = [
  // ym:u:* — users namespace (verified live)
  { key: "ym:u:users", description: "Total unique users (DAU/MAU)", status: "verified" },
  { key: "ym:u:newUsers", description: "New users (first launch in period)", status: "verified" },
  { key: "ym:u:newUsersShare", description: "Share of new users, percent", status: "verified" },

  // ym:s:* — sessions namespace
  { key: "ym:s:sessions", description: "Total number of sessions", status: "verified" },
  { key: "ym:s:avgSessionDuration", description: "Average session duration, seconds", status: "verified" },

  // ym:cr:* — crashes namespace
  { key: "ym:cr:crashes", description: "Total number of crashes", status: "verified" },

  // ym:ge:* — general events namespace (per docs/R-client examples)
  { key: "ym:ge:users", description: "Users in the general/event-based namespace", status: "documented" },
  { key: "ym:ge:newUsers", description: "New users (general namespace)", status: "documented" },
  { key: "ym:ge:devices", description: "Total devices", status: "documented" },
  { key: "ym:ge:newDevices", description: "New devices", status: "documented" },

  // ym:i:* — install / tracker namespace (per Habr Q&A example)
  { key: "ym:i:installDevices", description: "Devices that installed the app (install/tracker context — typically used with ym:i:publisher / ym:i:campaign filters)", status: "documented" },

  // ym:pc:* — push campaign namespace (per docs Push API)
  { key: "ym:pc:sentDevices", description: "Devices the push was sent to", status: "documented" },
  { key: "ym:pc:receivedDevices", description: "Devices that received the push", status: "documented" },
  { key: "ym:pc:openedDevices", description: "Devices where the push was opened", status: "documented" },
  { key: "ym:pc:conversion", description: "Push conversion rate", status: "documented" },
  { key: "ym:pc:users", description: "Users reached by the push campaign", status: "documented" },
];

type DimensionEntry = {
  key: string;
  description: string;
  status: "verified" | "documented";
};

const DIMENSIONS: DimensionEntry[] = [
  // ym:u:* — verified live
  { key: "ym:u:date", description: "Group by date (daily breakdown)", status: "verified" },
  { key: "ym:u:appVersion", description: "App version including build, e.g. '0.5.14.283'", status: "verified" },
  { key: "ym:u:regionCountry", description: "Country (id, name, iso_name)", status: "verified" },
  { key: "ym:u:operatingSystemInfo", description: "OS family — 'Android' or 'iOS'", status: "verified" },
  { key: "ym:u:deviceTypeName", description: "Device type — 'Смартфоны', 'Планшеты', etc.", status: "verified" },
  { key: "ym:u:gender", description: "User gender (sparse; large 'unknown' bucket)", status: "verified" },
  { key: "ym:u:age", description: "User age bucket (coarse age ranges; sparse, large 'unknown' fraction)", status: "verified" },

  // ym:ge:* — documented (R-client / docs examples)
  { key: "ym:ge:date", description: "Date (general namespace)", status: "documented" },
  { key: "ym:ge:appID", description: "Application ID", status: "documented" },
  { key: "ym:ge:mobileDeviceBranding", description: "Device manufacturer", status: "documented" },
  { key: "ym:ge:mobileDeviceModel", description: "Device model", status: "documented" },
  { key: "ym:ge:regionCityName", description: "City name", status: "documented" },

  // ym:i:* — install tracker dims (Habr Q&A example)
  { key: "ym:i:date", description: "Install date", status: "documented" },
  { key: "ym:i:publisher", description: "Tracker publisher", status: "documented" },
  { key: "ym:i:campaign", description: "Tracker campaign", status: "documented" },
  { key: "ym:i:regionCountry", description: "Country (install context)", status: "documented" },
  { key: "ym:i:regionArea", description: "Region/area (install context)", status: "documented" },

  // ym:pc:* — push campaign dims (docs Push API)
  { key: "ym:pc:group", description: "Push send group", status: "documented" },
  { key: "ym:pc:tag", description: "Push tag", status: "documented" },
  { key: "ym:pc:transfer", description: "Push transport (FCM / APNs / HMS)", status: "documented" },
  { key: "ym:pc:operatingSystem", description: "OS for push report", status: "documented" },
];

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
  };
}

export function registerReportingTools(server: ServerAdapter, client: AppMetricaClient): void {
  server.tool(
    "get_report",
    `Retrieve aggregated statistics from AppMetrica.
Call list_metrics first for the catalogue with namespace grammar and known-bad keys.
Quick reference:
  ym:u:* users · ym:s:* sessions · ym:cr:* crashes · ym:ge:* general events · ym:i:* installs · ym:pc:* push campaigns
Common 4002 traps: ym:u:sessions, ym:u:crashes, ym:u:revenue do not exist — use ym:s:, ym:cr:, and event_json from export_events instead.
Retention / per-user push opens / per-event aggregates are not exposed via get_report at all (use export_events / export_crashes, or the AppMetrica UI).
Mixing ym:u:/ym:s:/ym:cr: in one metrics= call has been observed to work; mixing more distant prefixes (e.g. ym:ge:+ym:pc:) is unsupported per docs.`,
    {
      app_id: z.number().describe("AppMetrica application ID"),
      metrics: z.array(z.string()).describe("Metric keys to retrieve, e.g. ['ym:u:users', 'ym:s:sessions', 'ym:cr:crashes']"),
      dimensions: z.array(z.string()).optional().describe("Dimension keys for breakdown, e.g. ['ym:u:date', 'ym:u:appVersion']"),
      date_from: z.string().describe("Start date in YYYY-MM-DD format"),
      date_to: z.string().describe("End date in YYYY-MM-DD format"),
      limit: z.number().optional().default(100).describe("Maximum number of rows to return"),
    },
    async (args) => {
      try {
        const { app_id, metrics, dimensions, date_from, date_to, limit } = args as {
          app_id: number;
          metrics: string[];
          dimensions?: string[];
          date_from: string;
          date_to: string;
          limit: number;
        };

        const params: Record<string, string | number> = {
          id: app_id,
          metrics: metrics.join(","),
          date1: date_from,
          date2: date_to,
          limit: limit ?? 100,
        };

        if (dimensions && dimensions.length > 0) {
          params.dimensions = dimensions.join(",");
        }

        const data = await client.get<unknown>("/stat/v1/data", params);
        return ok(data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "get_drilldown",
    "Retrieve drilldown statistics for a specific parent dimension value in AppMetrica. Useful for hierarchical data exploration.",
    {
      app_id: z.number().describe("AppMetrica application ID"),
      parent_id: z.string().describe("Parent dimension value ID for drilldown"),
      metrics: z.array(z.string()).describe("Metric keys to retrieve"),
      date_from: z.string().describe("Start date in YYYY-MM-DD format"),
      date_to: z.string().describe("End date in YYYY-MM-DD format"),
    },
    async (args) => {
      try {
        const { app_id, parent_id, metrics, date_from, date_to } = args as {
          app_id: number;
          parent_id: string;
          metrics: string[];
          date_from: string;
          date_to: string;
        };

        const params: Record<string, string | number> = {
          id: app_id,
          parent_id,
          metrics: metrics.join(","),
          date1: date_from,
          date2: date_to,
        };

        const data = await client.get<unknown>("/stat/v1/data/drilldown", params);
        return ok(data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "list_metrics",
    `Catalogue of AppMetrica Reports API metric and dimension keys for get_report / get_drilldown, with namespace grammar and known traps.
Each entry has status="verified" (confirmed live) or status="documented" (from AppMetrica docs / R-client examples but not yet probed by this MCP).
This is NOT exhaustive — AppMetrica does not publish a public metadata endpoint and the docs are SmartCaptcha-gated.
Unknown keys fail with HTTP 4002 (metric) or 4001 (dimension).`,
    {},
    async () =>
      ok({
        namespaces: {
          "ym:u:": "users (AppMetrica-specific alias; some keys work, many bogus — see traps below)",
          "ym:s:": "sessions",
          "ym:cr:": "crashes",
          "ym:ge:": "general events — canonical 'any activity' prefix per docs",
          "ym:ce:": "client events (event-sent context — no concrete keys catalogued here yet)",
          "ym:i:": "installs / install-side tracker dims and metrics",
          "ym:c:": "clicks / click-side tracker dims and metrics",
          "ym:pc:": "push campaigns",
        },
        constraints: [
          "Try to keep one namespace prefix per call — docs say mixing prefixes is unsupported, though ym:u:/ym:s:/ym:cr: have been observed to mix successfully.",
          "Revenue, retention, per-user push opens, per-event aggregates and per-crash-name aggregates are NOT available here — use export_events / export_crashes or the AppMetrica UI.",
          "crashRate / affectedUsers — no metric exists, compute manually from raw counts.",
          "Common 4002 traps: ym:u:sessions, ym:u:crashes, ym:u:revenue, ym:u:purchasers, ym:u:retention*, ym:u:pushOpens, ym:u:sessionDuration, ym:u:screenViews, ym:cr:crashRate.",
        ],
        // Pre-baked recipes for analytics needs that have no direct get_report metric.
        // These are the workarounds that LLM callers re-derive every session — bake them in
        // so the next agent doesn't waste cycles on empirical discovery.
        recipes: {
          revenue: {
            problem: "ym:u:revenue / ym:u:purchasers / ARPU are 4002 traps.",
            solution: "Call export_events with event_name set to your purchase event (e.g. 'subscription_purchase', 'iap_purchase'). Each row's event_json field is a JSON string — parse it and sum the price/revenue field client-side. Field name inside event_json is app-defined — check a sample event first.",
          },
          retention: {
            problem: "No retention metric exists in the Reports API. ym:u:retention1/7/30 are 4002 traps.",
            solution: "Two export_events calls: cohort day (e.g. install or first session) and return day. Take appmetrica_device_id sets, compute intersection / cohort size. Heavy for D30 — consider AppMetrica UI or a BigQuery dump if you need this regularly.",
          },
          crash_rate: {
            problem: "ym:cr:crashRate / ym:u:crashRate / affectedUsers do not exist.",
            solution: "One get_report call with metrics=['ym:cr:crashes', 'ym:u:users'] for the period; divide crashes / users client-side. Mixes namespaces but works in practice.",
          },
          funnel_conversion: {
            problem: "No built-in funnel metric.",
            solution: "Two export_events calls with the request and success event names (e.g. '_requested' / '_success'). Count rows in each, divide. For per-user funnels, dedupe by appmetrica_device_id first.",
          },
          push_open_rate: {
            problem: "Per-user push opens are not exposed via get_report.",
            solution: "Use ym:pc:openedDevices / ym:pc:sentDevices via get_report for device-level rate, or query AppMetrica UI / Push API directly for the campaign-level breakdown.",
          },
        },
        metrics: METRICS,
        dimensions: DIMENSIONS,
      })
  );
}
