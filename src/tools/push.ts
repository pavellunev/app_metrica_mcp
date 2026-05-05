import { z } from "zod";
import type { AppMetricaClient } from "../client.js";
import type { Config } from "../config.js";
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

export function registerPushTools(server: ServerAdapter, client: AppMetricaClient, config: Config): void {
  server.tool(
    "list_push_campaigns",
    "List push notification campaigns (groups) for an AppMetrica application. Optionally filter by campaign status.",
    {
      app_id: z.number().describe("AppMetrica application ID"),
      status: z
        .enum(["active", "paused", "finished"])
        .optional()
        .describe("Filter campaigns by status: active, paused, or finished"),
    },
    async (args) => {
      try {
        const { app_id, status } = args as { app_id: number; status?: "active" | "paused" | "finished" };
        const params: Record<string, string | number> = { app_id };
        if (status) params.status = status;

        const data = await client.get<unknown>("/push/v1/management/groups", params);
        return ok(data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "get_push_stats",
    "Get summary statistics for a specific push notification campaign in AppMetrica.",
    {
      app_id: z.number().describe("AppMetrica application ID"),
      campaign_id: z.number().describe("Push campaign (group) ID"),
    },
    async (args) => {
      try {
        const { app_id, campaign_id } = args as { app_id: number; campaign_id: number };
        const params: Record<string, string | number> = { app_id, group_id: campaign_id };

        const data = await client.get<unknown>("/push/v1/statistics/groups/summary", params);
        return ok(data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.tool(
    "create_push_campaign",
    "Create a new push notification campaign in AppMetrica. Requires APPMETRICA_ALLOW_WRITE=true to be set.",
    {
      app_id: z.number().describe("AppMetrica application ID"),
      name: z.string().describe("Campaign name"),
      message: z
        .object({
          title: z.string().describe("Push notification title"),
          body: z.string().describe("Push notification body text"),
        })
        .describe("Push notification message content"),
      audience: z
        .object({
          segment_id: z.number().optional().describe("Target segment ID"),
        })
        .optional()
        .describe("Audience targeting options"),
      schedule: z
        .object({
          send_at: z.string().describe("Scheduled send time in ISO 8601 format"),
        })
        .optional()
        .describe("Schedule options for the campaign"),
    },
    async (args) => {
      if (!config.allowWrite) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Write operations are disabled. Set APPMETRICA_ALLOW_WRITE=true to enable.",
            },
          ],
        };
      }

      try {
        const { app_id, name, message, audience, schedule } = args as {
          app_id: number;
          name: string;
          message: { title: string; body: string };
          audience?: { segment_id?: number };
          schedule?: { send_at: string };
        };

        const body: Record<string, unknown> = { app_id, name, message };
        if (audience) body.audience = audience;
        if (schedule) body.schedule = schedule;

        const data = await client.post<unknown>("/push/v1/management/groups", body);
        return ok(data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
