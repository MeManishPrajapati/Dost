import pino from "pino";
import type { Env } from "../config/env.js";

export type AppLogger = pino.Logger;

export function createLogger(env: Env): AppLogger {
  return pino({
    level: env.logLevel,
    ...(env.logPretty
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  });
}
