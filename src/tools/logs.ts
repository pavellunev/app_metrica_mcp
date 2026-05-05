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
    "Export raw event logs from AppMetrica for a given application and time range. Optionally filter by event name.",
    {
      app_id: z.number().describe("AppMetrica application ID"),
      date_from: z.string().describe("Start date in YYYY-MM-DD format"),
      date_to: z.string().describe("End date in YYYY-MM-DD format"),
      event_name: z.string().optional().describe("Filter by specific event name"),
      limit: z.number().optional().default(1000).describe("Maximum number of events to return"),
    },
    async (args) => {
      try {
        const { app_id, date_from, date_to, event_name, limit } = args as {
          app_id: number;
          date_from: string;
          date_to: string;
          event_name?: string;
          limit: number;
        };

        const params: Record<string, string | number> = {
          application_id: app_id,
          date_since: date_from,
          date_until: date_to,
          limit: limit ?? 1000,
        };

        if (event_name) params.event_name = event_name;

        const rows = await exportLogs(client, "events", params);
        return ok(rows);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "export_crashes",
    "Export raw crash logs from AppMetrica for a given application and time range.",
    {
      app_id: z.number().describe("AppMetrica application ID"),
      date_from: z.string().describe("Start date in YYYY-MM-DD format"),
      date_to: z.string().describe("End date in YYYY-MM-DD format"),
      limit: z.number().optional().default(1000).describe("Maximum number of crash records to return"),
    },
    async (args) => {
      try {
        const { app_id, date_from, date_to, limit } = args as {
          app_id: number;
          date_from: string;
          date_to: string;
          limit: number;
        };

        const params: Record<string, string | number> = {
          application_id: app_id,
          date_since: date_from,
          date_until: date_to,
          limit: limit ?? 1000,
        };

        const rows = await exportLogs(client, "crashes", params);
        return ok(rows);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "export_installations",
    "Export raw installation logs from AppMetrica for a given application and time range.",
    {
      app_id: z.number().describe("AppMetrica application ID"),
      date_from: z.string().describe("Start date in YYYY-MM-DD format"),
      date_to: z.string().describe("End date in YYYY-MM-DD format"),
      limit: z.number().optional().default(1000).describe("Maximum number of installation records to return"),
    },
    async (args) => {
      try {
        const { app_id, date_from, date_to, limit } = args as {
          app_id: number;
          date_from: string;
          date_to: string;
          limit: number;
        };

        const params: Record<string, string | number> = {
          application_id: app_id,
          date_since: date_from,
          date_until: date_to,
          limit: limit ?? 1000,
        };

        const rows = await exportLogs(client, "installations", params);
        return ok(rows);
      } catch (e) {
        return err(e);
      }
    }
  );
}
