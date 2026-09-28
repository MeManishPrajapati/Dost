import { z } from "zod";

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const envSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: logLevelSchema.default("info"),
  LOG_PRETTY: z.enum(["true", "false"]).optional(),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.1"),
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  SARVAM_API_KEY: z.string().default(""),
  SARVAM_STT_LANGUAGE: z.string().min(1).default("auto"),
  SARVAM_STT_MODEL: z.string().min(1).default("saaras:v3-realtime"),
  SARVAM_STT_MODE: z
    .enum(["transcribe", "translate", "verbatim", "translit", "codemix"])
    .default("transcribe"),
  SARVAM_STT_STREAM_TYPE: z.enum(["fast", "balanced", "simulated"]).default("balanced"),
  SARVAM_STT_ENDPOINTING: z.enum(["vad", "manual"]).default("manual"),
  SARVAM_TTS_MODEL: z.enum(["bulbul:v2", "bulbul:v3"]).default("bulbul:v3"),
  SARVAM_TTS_SPEAKER: z.string().min(1).default("shubh"),
  SARVAM_TTS_LANGUAGE: z.string().min(1).default("en-IN"),
  SARVAM_TTS_SAMPLE_RATE: z.coerce
    .number()
    .refine((value) => [8000, 16000, 22050, 24000].includes(value))
    .default(24000),
  SARVAM_TTS_CODEC: z
    .enum(["mp3", "wav", "aac", "opus", "flac", "linear16", "mulaw", "alaw"])
    .default("mp3"),
  MEMORY_DRIVER: z.enum(["memory", "mongodb"]).optional(),
  MONGODB_URI: z.string().default(""),
  HISTORY_MESSAGE_LIMIT: z.coerce.number().int().positive().default(40),
  USER_TIMEZONE: z.string().min(1).default("Asia/Kolkata"),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  MCP_CONFIG_PATH: z.string().min(1).default("./config/mcp.servers.example.json"),
  ENABLE_DEV_CLIENT: z.enum(["true", "false"]).optional(),
  TLS_CERT: z.string().optional(),
  TLS_KEY: z.string().optional(),
  VISION_PROVIDER: z.enum(["ollama"]).default("ollama"),
  VISION_MODEL: z.string().min(1).default("gemma4:latest"),
  VISION_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(5_242_880),
});

export interface Env {
  host: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  logLevel: z.infer<typeof logLevelSchema>;
  logPretty: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTemperature: number;
  sarvamApiKey: string;
  sarvamSttLanguage: string;
  sarvamSttModel: string;
  sarvamSttMode: "transcribe" | "translate" | "verbatim" | "translit" | "codemix";
  sarvamSttStreamType: "fast" | "balanced" | "simulated";
  sarvamSttEndpointing: "vad" | "manual";
  sarvamTtsModel: "bulbul:v2" | "bulbul:v3";
  sarvamTtsSpeaker: string;
  sarvamTtsLanguage: string;
  sarvamTtsSampleRate: number;
  sarvamTtsCodec: "mp3" | "wav" | "aac" | "opus" | "flac" | "linear16" | "mulaw" | "alaw";
  memoryDriver: "memory" | "mongodb";
  mongodbUri: string;
  historyMessageLimit: number;
  userTimezone: string;
  agentTimeoutMs: number;
  mcpConfigPath: string;
  enableDevClient: boolean;
  tlsCert: string | undefined;
  tlsKey: string | undefined;
  visionProvider: "ollama";
  visionModel: string;
  visionMaxImageBytes: number;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join(".") || "environment")
      .join(", ");
    throw new Error(`Invalid environment: ${fields}`);
  }

  const raw = parsed.data;
  const memoryDriver = raw.MEMORY_DRIVER ?? (raw.MONGODB_URI ? "mongodb" : "memory");
  if (memoryDriver === "mongodb" && !raw.MONGODB_URI) {
    throw new Error("Invalid environment: MONGODB_URI");
  }

  return {
    host: raw.HOST,
    port: raw.PORT,
    nodeEnv: raw.NODE_ENV,
    logLevel: raw.LOG_LEVEL,
    logPretty: raw.LOG_PRETTY ? raw.LOG_PRETTY === "true" : raw.NODE_ENV !== "production",
    ollamaBaseUrl: raw.OLLAMA_BASE_URL,
    ollamaModel: raw.OLLAMA_MODEL,
    ollamaTemperature: raw.OLLAMA_TEMPERATURE,
    sarvamApiKey: raw.SARVAM_API_KEY,
    sarvamSttLanguage: raw.SARVAM_STT_LANGUAGE,
    sarvamSttModel: raw.SARVAM_STT_MODEL,
    sarvamSttMode: raw.SARVAM_STT_MODE,
    sarvamSttStreamType: raw.SARVAM_STT_STREAM_TYPE,
    sarvamSttEndpointing: raw.SARVAM_STT_ENDPOINTING,
    sarvamTtsModel: raw.SARVAM_TTS_MODEL,
    sarvamTtsSpeaker: raw.SARVAM_TTS_SPEAKER,
    sarvamTtsLanguage: raw.SARVAM_TTS_LANGUAGE,
    sarvamTtsSampleRate: raw.SARVAM_TTS_SAMPLE_RATE,
    sarvamTtsCodec: raw.SARVAM_TTS_CODEC,
    memoryDriver,
    mongodbUri: raw.MONGODB_URI,
    historyMessageLimit: raw.HISTORY_MESSAGE_LIMIT,
    userTimezone: raw.USER_TIMEZONE,
    agentTimeoutMs: raw.AGENT_TIMEOUT_MS,
    mcpConfigPath: raw.MCP_CONFIG_PATH,
    enableDevClient: raw.ENABLE_DEV_CLIENT
      ? raw.ENABLE_DEV_CLIENT === "true"
      : raw.NODE_ENV !== "production",
    tlsCert: raw.TLS_CERT,
    tlsKey: raw.TLS_KEY,
    visionProvider: raw.VISION_PROVIDER,
    visionModel: raw.VISION_MODEL,
    visionMaxImageBytes: raw.VISION_MAX_IMAGE_BYTES,
  };
}
