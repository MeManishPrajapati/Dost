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

async function loadTlsOptions(env: Env) {
  if (!env.tlsCert || !env.tlsKey) return undefined;
  const [cert, key] = await Promise.all([readFile(env.tlsCert), readFile(env.tlsKey)]);
  return { cert, key };
}

export async function createHttpServer(deps: AppDeps): Promise<FastifyInstance> {
  const https = await loadTlsOptions(deps.env);
  const app = Fastify({
    logger: { level: deps.env.logLevel },
    genReqId: (request) => requestIdFromIncoming(request),
    bodyLimit: 1_000_000,
    requestTimeout: deps.env.agentTimeoutMs + 5_000,
    ...(https && { https }),
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
    const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
    const servePublicFile =
      (file: string, contentType: string) => async (_request: unknown, reply: { type: (t: string) => { send: (b: string | Buffer) => unknown } }) => {
        const content = await readFile(path.join(publicDir, file));
        return reply.type(contentType).send(content);
      };

    app.get("/", servePublicFile("voice-client.html", "text/html"));
    app.get("/manifest.json", servePublicFile("manifest.json", "application/manifest+json"));
    app.get("/sw.js", servePublicFile("sw.js", "text/javascript"));
    app.get("/icon-192.svg", servePublicFile("icon-192.svg", "image/svg+xml"));
    app.get("/icon-512.svg", servePublicFile("icon-512.svg", "image/svg+xml"));
  }

  await registerVoiceSocket(app, deps);

  return app;
}
