import { loadDotEnv } from "./config/dotenv.js";
import { loadEnv } from "./config/env.js";
import { createDostGraph } from "./agent/graph.js";
import { createAgentRunner } from "./agent/runner.js";
import { OllamaProvider } from "./llm/ollama.js";
import { createConversationRepository } from "./memory/repository.js";
import { connectMcpServers } from "./mcp/client.js";
import { loadMcpConfig } from "./mcp/server-config.js";
import { createHttpServer } from "./server/http.js";
import { createLogger } from "./server/logger.js";
import { createSarvamSTT } from "./voice/stt/sarvam.js";
import { createSarvamTTS } from "./voice/tts/sarvam.js";

async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  const logger = createLogger(env);
  const conversations = await createConversationRepository(env, logger);
  const mcp = await connectMcpServers(loadMcpConfig(env.mcpConfigPath), logger);
  const llm = new OllamaProvider(env);
  const graph = createDostGraph({
    model: llm.bindableModel(),
    registry: mcp,
    logger,
    timezone: env.userTimezone,
  });
  const agent = createAgentRunner({
    graph,
    conversations,
    logger,
    historyLimit: env.historyMessageLimit,
    timeoutMs: env.agentTimeoutMs,
  });
  const app = await createHttpServer({
    env,
    logger,
    agent,
    stt: createSarvamSTT(env),
    tts: createSarvamTTS(env),
  });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, "shutting down");
    await app.close();
    await mcp.close();
    await conversations.close();
    process.exit(0);
  };
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await app.listen({ port: env.port, host: env.host });
  logger.info(
    {
      ollamaBaseUrl: env.ollamaBaseUrl,
      ollamaModel: env.ollamaModel,
      memoryDriver: env.memoryDriver,
      tools: mcp.list().map((tool) => tool.name),
    },
    "Dost listening",
  );
  if (env.enableDevClient) {
    const proto = env.tlsCert ? "https" : "http";
    logger.info(`voice test client: ${proto}://127.0.0.1:${env.port}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Dost failed to start";
  console.error(message);
  process.exit(1);
});
