import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { AppMetricaClient } from "./client.js";
import { registerManagementTools } from "./tools/management.js";
import { registerReportingTools } from "./tools/reporting.js";
import { registerLogTools } from "./tools/logs.js";
import { registerPushTools } from "./tools/push.js";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export type ServerAdapter = {
  tool: (name: string, description: string, schema: z.ZodRawShape, handler: ToolHandler) => void;
};

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: "appmetrica-mcp",
    version: "0.1.2",
  });

  const client = new AppMetricaClient(config);

  const serverAdapter: ServerAdapter = {
    tool(name, description, schema, handler): void {
      server.tool(name, description, schema, async (args) => {
        return handler(args as Record<string, unknown>);
      });
    },
  };

  registerManagementTools(serverAdapter, client);
  registerReportingTools(serverAdapter, client);
  registerLogTools(serverAdapter, client);
  registerPushTools(serverAdapter, client, config);

  return server;
}
