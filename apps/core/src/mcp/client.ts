import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AppLogger } from "../server/logger.js";
import { AppError } from "../shared/errors.js";
import { ToolRegistry } from "./registry.js";
import type { McpConfig, McpServerConfig } from "./server-config.js";

export async function connectMcpServers(config: McpConfig, logger: AppLogger): Promise<ToolRegistry> {
  const registry = new ToolRegistry();
  const connected: Client[] = [];

  try {
    for (const server of config.servers) {
      if (!server.enabled) {
        logger.info({ server: server.id }, "MCP server disabled");
        continue;
      }
      const client = new Client({ name: "dost", version: "0.1.0" });
      await client.connect(createTransport(server));
      connected.push(client);
      const listed = await client.listTools();
      const names: string[] = [];
      for (const tool of listed.tools) {
        const registered = registry.add({
          serverId: server.id,
          name: tool.name,
          description: tool.description ?? tool.name,
          inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : { type: "object", properties: {} },
          call: (args, signal) => invokeTool(client, tool.name, args, signal),
        });
        names.push(registered);
      }
      logger.info({ server: server.id, tools: names }, "MCP server connected");
    }
  } catch (error) {
    await Promise.all(connected.map((client) => client.close().catch(() => undefined)));
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : "Failed to connect to an MCP server";
    throw new AppError("mcp_connect_failed", message, 500, { cause: error });
  }

  for (const client of connected) {
    registry.addCloser(() => client.close());
  }
  return registry;
}

async function invokeTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const result = await client.callTool(
    { name, arguments: args },
    undefined,
    signal ? { signal } : undefined,
  );
  if (result.isError) {
    throw new Error(contentToText(result.content) || `Tool ${name} failed`);
  }
  return contentToText(result.content);
}

function createTransport(server: McpServerConfig) {
  if (server.transport === "stdio") {
    return new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: {
        ...getDefaultEnvironment(),
        ...server.env,
      },
      stderr: "pipe",
    });
  }
  return new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: server.headers ? { headers: server.headers } : undefined,
  });
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      if ("text" in block && typeof block.text === "string") return block.text;
      return JSON.stringify(block);
    })
    .filter(Boolean)
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
