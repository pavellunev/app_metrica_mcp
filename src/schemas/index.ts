import { z } from "zod";

export const AppIdSchema = z.number().describe("AppMetrica application ID");

export const DateSchema = z.string().describe("Date in YYYY-MM-DD format");

export const MetricsSchema = z
  .array(z.string())
  .describe("Array of AppMetrica metric keys, e.g. ['ym:u:users', 'ym:u:sessions']");

export const LimitSchema = z.number().optional().default(100).describe("Maximum number of rows to return");
