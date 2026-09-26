import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import pino, { type Logger } from "pino";
import type { Env } from "../config/env.js";
import { requestContext } from "./context.js";

export type AppLogger = Logger;

export function createLogger(env: Env): AppLogger {
  return pino({
    level: env.logLevel,
    base: { service: "dost" },
    mixin() {
      const store = requestContext.getStore();
      if (!store) return {};
      return {
        requestId: store.requestId,
        ...(store.conversationId ? { conversationId: store.conversationId } : {}),
        ...(store.sessionId ? { sessionId: store.sessionId } : {}),
      };
    },
    ...(env.logPretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
          },
        }
      : {}),
  });
}

export function createRequestId(header: string | string[] | undefined): string {
  if (typeof header === "string" && /^[\w.-]{1,200}$/.test(header)) return header;
  return randomUUID();
}

export function requestIdFromIncoming(request: IncomingMessage): string {
  return createRequestId(request.headers["x-request-id"]);
}
