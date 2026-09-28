import pino from "pino";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { createHttpServer } from "../src/server/http.js";
import type { AgentRunner } from "../src/shared/types.js";
import type { STTProvider } from "../src/voice/stt/provider.js";
import type { TTSProvider } from "../src/voice/tts/provider.js";
import { VisionService } from "../src/vision/service.js";
import type { VisionModelProvider, VisionResponse } from "../src/vision/provider.js";

const env = loadEnv({
  NODE_ENV: "test",
  ENABLE_DEV_CLIENT: "false",
  LOG_LEVEL: "silent",
} as NodeJS.ProcessEnv);

const unusedVoice = {
  stt: { async startSession() { throw new Error("unused"); } } satisfies STTProvider,
  tts: { async startSession() { throw new Error("unused"); } } satisfies TTSProvider,
};

const stubAgent: AgentRunner = {
  async *run() {
    yield { type: "done", text: "" };
  },
};

function createMockProvider(response?: Partial<VisionResponse>, error?: Error): VisionModelProvider {
  return {
    async analyze() {
      if (error) throw error;
      return {
        text: response?.text ?? "This is a test response",
        provider: response?.provider ?? "ollama",
        model: response?.model ?? "gemma3",
        usage: response?.usage,
      };
    },
  };
}

function buildMultipart(
  fields: Record<string, string>,
  files: { fieldname: string; filename: string; content: Buffer; contentType: string }[],
): { body: Buffer; contentType: string } {
  const boundary = "----TestBoundary" + Date.now();
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ));
  }

  for (const file of files) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ));
    parts.push(file.content);
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsK" +
  "CwsKDA0QDAwNEA0KDBIQERISFQ0WFBcVFBMSERIUEf/2wBDAQMEBAUEBQkFBQkRCwsLERERERER" +
  "ERERERERERERERERERERERERERERERERERERERERERERERERERERERH/wAARCAABAAEDASIAAhEBAxEB/8QA" +
  "FAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA" +
  "/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJgA//9k=",
  "base64",
);

async function createServer(provider?: VisionModelProvider) {
  const vision = new VisionService(provider ?? createMockProvider());
  return createHttpServer({
    env,
    logger: pino({ level: "silent" }),
    agent: stubAgent,
    ...unusedVoice,
    vision,
  });
}

describe("Vision API", () => {
  it("returns a vision response for a valid request", async () => {
    const app = await createServer();
    const { body, contentType } = buildMultipart(
      { query: "What is this?" },
      [{ fieldname: "image", filename: "frame.jpg", content: TINY_JPEG, contentType: "image/jpeg" }],
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/vision/query",
      headers: { "content-type": contentType },
      body,
    });
    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data).toEqual({
      answer: "This is a test response",
      model: "gemma3",
      provider: "ollama",
    });
    await app.close();
  });

  it("rejects requests without an image", async () => {
    const app = await createServer();
    const { body, contentType } = buildMultipart(
      { query: "What is this?" },
      [],
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/vision/query",
      headers: { "content-type": contentType },
      body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_error");
    expect(response.json().error.message).toMatch(/image/i);
    await app.close();
  });

  it("rejects requests without a query", async () => {
    const app = await createServer();
    const { body, contentType } = buildMultipart(
      {},
      [{ fieldname: "image", filename: "frame.jpg", content: TINY_JPEG, contentType: "image/jpeg" }],
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/vision/query",
      headers: { "content-type": contentType },
      body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("validation_error");
    await app.close();
  });

  it("rejects an unsupported MIME type", async () => {
    const app = await createServer();
    const { body, contentType } = buildMultipart(
      { query: "What is this?" },
      [{ fieldname: "image", filename: "frame.gif", content: TINY_JPEG, contentType: "image/gif" }],
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/vision/query",
      headers: { "content-type": contentType },
      body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/Unsupported image type/);
    await app.close();
  });

  it("rejects non-multipart requests", async () => {
    const app = await createServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/vision/query",
      headers: { "content-type": "application/json" },
      payload: { query: "hi" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/multipart/i);
    await app.close();
  });

  it("returns 502 when the vision provider fails", async () => {
    const failingProvider = createMockProvider(undefined, new Error("Connection refused"));
    const app = await createServer(failingProvider);
    const { body, contentType } = buildMultipart(
      { query: "What is this?" },
      [{ fieldname: "image", filename: "frame.jpg", content: TINY_JPEG, contentType: "image/jpeg" }],
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/vision/query",
      headers: { "content-type": contentType },
      body,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("vision_error");
    await app.close();
  });
});
