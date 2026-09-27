import { z } from "zod";

const envSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.coerce.number().int().min(1).default(4000),
  mcpPort: z.coerce.number().int().min(1).default(4001),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  logPretty: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  commandTimeoutMs: z.coerce.number().int().min(1000).default(30_000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse({
    host: process.env.HOST,
    port: process.env.PORT,
    mcpPort: process.env.MCP_PORT,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    commandTimeoutMs: process.env.COMMAND_TIMEOUT_MS,
  });
}
