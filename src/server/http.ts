import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { registerChatRoute } from "../transport/http/chat.js";
import type { AgentRunner } from "../shared/types.js";
import { AppError } from "../shared/errors.js";
import type { STTProvider } from "../voice/stt/provider.js";
import type { TTSProvider } from "../voice/tts/provider.js";
import { requestIdFromIncoming, type AppLogger } from "./logger.js";
import { registerVoiceSocket } from "./websocket.js";

export interface AppDeps {
  env: Env;
  logger: AppLogger;
  agent: AgentRunner;
  stt: STTProvider;
  tts: TTSProvider;
}

export async function createHttpServer(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: deps.env.logLevel },
    genReqId: (request) => requestIdFromIncoming(request),
    bodyLimit: 1_000_000,
    requestTimeout: deps.env.agentTimeoutMs + 5_000,
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    const appError = error instanceof AppError ? error : null;
    const statusFromError =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const status = appError?.statusCode ?? statusFromError;
    const code = appError?.code ?? (status === 400 ? "validation_error" : "internal_error");
    const message =
      status >= 500 && deps.env.nodeEnv === "production"
        ? "Internal error"
        : error instanceof Error
          ? error.message
          : "Request failed";
    request.log.error({ err: error, code }, "request failed");
    return reply.status(status).send({
      error: { code, message, requestId: request.id },
    });
  });

  app.get("/health", async () => ({ status: "ok" as const }));
  registerChatRoute(app, deps);

  if (deps.env.enableDevClient) {
    const devClientPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../public/voice-client.html",
    );
    app.get("/dev/voice", async (_request, reply) => {
      const html = await readFile(devClientPath, "utf8");
      return reply.type("text/html").send(html);
    });
  }

  await registerVoiceSocket(app, deps);

  return app;
}
