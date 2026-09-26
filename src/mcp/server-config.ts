import { readFileSync } from "node:fs";
import { z } from "zod";
import { AppError } from "../shared/errors.js";

const stdioServerSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
});

const httpServerSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

const configSchema = z.object({
  servers: z.array(z.discriminatedUnion("transport", [stdioServerSchema, httpServerSchema])).default([]),
});

export type McpServerConfig = z.infer<typeof configSchema>["servers"][number];
export type McpConfig = z.infer<typeof configSchema>;

export function parseMcpConfig(raw: unknown): McpConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("mcp_config_invalid", "MCP server configuration is invalid", 500);
  }
  const ids = new Set<string>();
  for (const server of parsed.data.servers) {
    if (ids.has(server.id)) {
      throw new AppError("mcp_config_invalid", `Duplicate MCP server id: ${server.id}`, 500);
    }
    ids.add(server.id);
  }
  return parsed.data;
}

export function loadMcpConfig(filePath: string): McpConfig {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new AppError("mcp_config_missing", `Cannot read MCP config at ${filePath}`, 500, {
      cause: error,
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw new AppError("mcp_config_invalid", `MCP config is not valid JSON: ${filePath}`, 500, {
      cause: error,
    });
  }
  return parseMcpConfig(raw);
}
