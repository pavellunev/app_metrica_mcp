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

export function registerManagementTools(server: ServerAdapter, client: AppMetricaClient): void {
  server.tool(
    "list_applications",
    "List all AppMetrica applications available to the authenticated user. Returns application IDs, names, platforms, and creation dates.",
    {},
    async () => {
      try {
        const data = await client.get<{
          applications: Array<{
            id: number;
            name: string;
            platform: string;
            created_at: string;
          }>;
        }>("/management/v1/applications");

        const apps = data.applications.map((app) => ({
          id: app.id,
          name: app.name,
          platform: app.platform,
          created_at: app.created_at,
        }));

        return ok(apps);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "get_application",
    "Get detailed information about a specific AppMetrica application by its ID.",
    {
      app_id: z.number().describe("AppMetrica application ID"),
    },
    async (args) => {
      try {
        const { app_id } = args as { app_id: number };
        const data = await client.get<unknown>(`/management/v1/applications/${app_id}`);
        return ok(data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
