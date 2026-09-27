import pino from "pino";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { createHttpServer } from "../src/server/http.js";
import type { AgentRunner } from "../src/shared/types.js";
import type { STTProvider } from "../src/voice/stt/provider.js";
import type { TTSProvider } from "../src/voice/tts/provider.js";

const env = loadEnv({
  NODE_ENV: "test",
  ENABLE_DEV_CLIENT: "false",
  LOG_LEVEL: "silent",
} as NodeJS.ProcessEnv);

const unusedVoice = {
  stt: { async startSession() { throw new Error("unused"); } } satisfies STTProvider,
  tts: { async startSession() { throw new Error("unused"); } } satisfies TTSProvider,
};

describe("HTTP API", () => {
  it("returns health", async () => {
    const app = await createServer({
      async *run() {
        yield { type: "done", text: "" };
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "trace-123" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toBe("trace-123");
    await app.close();
  });

  it("normalizes a chat request into the shared agent", async () => {
    let seenSource = "";
    const app = await createServer({
      async *run(input) {
        seenSource = input.metadata?.source ?? "";
        yield { type: "text.delta", text: "4" };
        yield { type: "done", text: "4" };
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { conversationId: "test", message: "What is 2 + 2?" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ conversationId: "test", message: "4" });
    expect(seenSource).toBe("text");
    await app.close();
  });

  it("rejects an empty chat message", async () => {
    const app = await createServer({
      async *run() {
        yield { type: "done", text: "" };
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { conversationId: "test", message: " " },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_error");
    await app.close();
  });
});

async function createServer(agent: AgentRunner) {
  return createHttpServer({
    env,
    logger: pino({ level: "silent" }),
    agent,
    ...unusedVoice,
  });
}
