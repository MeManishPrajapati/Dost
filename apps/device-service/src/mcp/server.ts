import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { DeviceRegistry } from "../device/registry.js";
import type { DeviceCommandRouter } from "../command/router.js";
import type { AppLogger } from "../server/logger.js";
import { registerDeviceTools } from "./tools.js";

export type McpServerFactory = () => McpServer;

export function createMcpServerFactory(
  registry: DeviceRegistry,
  router: DeviceCommandRouter,
  logger: AppLogger,
): McpServerFactory {
  return () => {
    const mcp = new McpServer({ name: "dost-device-service", version: "0.1.0" });
    registerDeviceTools(mcp, registry, router);
    return mcp;
  };
}

export async function startMcpHttpServer(
  factory: McpServerFactory,
  port: number,
  host: string,
  logger: AppLogger,
): Promise<ReturnType<typeof createServer>> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/mcp") {
      const mcp = factory();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        transport.close().catch(() => {});
        mcp.close().catch(() => {});
      });

      try {
        await mcp.connect(transport);
        await transport.handleRequest(req, res);
      } catch (err) {
        logger.error({ err }, "MCP request error");
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      logger.info({ host, port }, "MCP HTTP server listening");
      resolve(server);
    });
  });
}
