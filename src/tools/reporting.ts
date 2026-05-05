import { z } from "zod";
import type { AppMetricaClient } from "../client.js";
import type { ServerAdapter, ToolResult } from "../server.js";

const POPULAR_METRICS = [
  { key: "ym:u:users", description: "Total unique users (DAU/MAU)" },
  { key: "ym:u:sessions", description: "Total number of sessions" },
  { key: "ym:u:newUsers", description: "New users (first launch)" },
  { key: "ym:u:crashes", description: "Total number of crashes" },
  { key: "ym:u:crashRate", description: "Crash rate (crashes per session)" },
  { key: "ym:u:sessionDuration", description: "Average session duration in seconds" },
  { key: "ym:u:screenViews", description: "Total number of screen views" },
  { key: "ym:u:pushOpens", description: "Number of push notification opens" },
  { key: "ym:u:revenue", description: "Total in-app purchase revenue" },
  { key: "ym:u:purchasers", description: "Number of users who made a purchase" },
  { key: "ym:u:revenuePerUser", description: "Average revenue per user (ARPU)" },
  { key: "ym:u:retention1", description: "Day 1 retention rate" },
  { key: "ym:u:retention7", description: "Day 7 retention rate" },
  { key: "ym:u:retention30", description: "Day 30 retention rate" },
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
    "Retrieve aggregated statistics from AppMetrica for a given application. Supports metrics like users, sessions, crashes, revenue, and custom dimensions for breakdown.",
    {
      app_id: z.number().describe("AppMetrica application ID"),
      metrics: z.array(z.string()).describe("Metric keys to retrieve, e.g. ['ym:u:users', 'ym:u:sessions']"),
      dimensions: z.array(z.string()).optional().describe("Dimension keys for breakdown, e.g. ['ym:u:appVersion']"),
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
    "List available AppMetrica metrics with their descriptions. Use this to discover valid metric keys for get_report and get_drilldown.",
    {},
    async () => ok(POPULAR_METRICS)
  );
}
