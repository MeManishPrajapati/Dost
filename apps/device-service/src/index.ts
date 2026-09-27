import { loadEnv } from "./config/env.js";
import { createLogger } from "./server/logger.js";
import { DeviceRegistry } from "./device/registry.js";
import { DeviceCommandRouter } from "./command/router.js";
import { createMcpServerFactory, startMcpHttpServer } from "./mcp/server.js";
import { createHttpServer } from "./server/http.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);
  const registry = new DeviceRegistry();
  const router = new DeviceCommandRouter(registry, env.commandTimeoutMs, logger);
  const mcpFactory = createMcpServerFactory(registry, router, logger);

  const app = await createHttpServer({ env, logger, registry, router });
  const mcpHttpServer = await startMcpHttpServer(mcpFactory, env.mcpPort, env.host, logger);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, "shutting down");
    router.close();
    mcpHttpServer.close();
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.port, host: env.host });
  logger.info(
    { host: env.host, port: env.port, mcpPort: env.mcpPort, env: env.nodeEnv },
    "Dost Device Service listening",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Dost Device Service failed to start";
  console.error(message);
  process.exit(1);
});
