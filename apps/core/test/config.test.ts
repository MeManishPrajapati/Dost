import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { parseMcpConfig } from "../src/mcp/server-config.js";
import { ToolRegistry } from "../src/mcp/registry.js";
import { resolveTtsLanguage } from "../src/voice/language.js";
import { buildSarvamSttUrl } from "../src/voice/stt/sarvam.js";
import { buildSarvamTtsUrl, sarvamTtsConfig } from "../src/voice/tts/sarvam.js";
import { parseClientEvent } from "../src/shared/events.js";

const env = loadEnv({
  OLLAMA_BASE_URL: "http://10.0.0.8:11434",
  OLLAMA_MODEL: "qwen2.5",
  SARVAM_STT_LANGUAGE: "auto",
} as NodeJS.ProcessEnv);

describe("configuration", () => {
  it("keeps the Ollama host and model configurable", () => {
    expect(env.ollamaBaseUrl).toBe("http://10.0.0.8:11434");
    expect(env.ollamaModel).toBe("qwen2.5");
    expect(env.sarvamSttLanguage).toBe("auto");
    expect(env.memoryDriver).toBe("memory");
  });

  it("sets vision defaults", () => {
    expect(env.visionProvider).toBe("ollama");
    expect(env.visionModel).toBe("gemma4:latest");
    expect(env.visionMaxImageBytes).toBe(5_242_880);
  });

  it("allows overriding vision configuration", () => {
    const custom = loadEnv({
      VISION_PROVIDER: "ollama",
      VISION_MODEL: "llava",
      VISION_MAX_IMAGE_BYTES: "1048576",
    } as unknown as NodeJS.ProcessEnv);
    expect(custom.visionModel).toBe("llava");
    expect(custom.visionMaxImageBytes).toBe(1_048_576);
  });

  it("rejects an invalid Ollama URL without echoing the value", () => {
    expect(() => loadEnv({ OLLAMA_BASE_URL: "not a url" } as NodeJS.ProcessEnv)).toThrow(
      /OLLAMA_BASE_URL/,
    );
  });

  it("parses MCP server config and skips nothing that is disabled", () => {
    const config = parseMcpConfig({
      servers: [
        {
          id: "notes",
          enabled: false,
          transport: "stdio",
          command: "node",
          args: ["server.js"],
        },
      ],
    });
    expect(config.servers[0]?.enabled).toBe(false);
  });

  it("builds Sarvam URLs with auto language detection and websocket TTS config", () => {
    const stt = new URL(buildSarvamSttUrl(env, 16000));
    expect(stt.pathname).toBe("/speech-to-text-realtime/ws");
    expect(stt.searchParams.get("language_code")).toBe("auto");
    expect(stt.searchParams.get("sample_rate")).toBe("16000");

    const tts = new URL(buildSarvamTtsUrl(env));
    expect(tts.pathname).toBe("/text-to-speech/ws");
    expect(tts.searchParams.get("model")).toBe("bulbul:v3");
    const config = sarvamTtsConfig(env, "gu-IN");
    expect(config).toMatchObject({
      type: "config",
      data: { language_code: "gu-IN", speaker: "shubh" },
    });
    expect(JSON.stringify(config)).not.toContain("target_language_code");
  });

  it("maps detected speech to a Sarvam TTS language", () => {
    expect(resolveTtsLanguage("gu-IN", "en-IN")).toBe("gu-IN");
    expect(resolveTtsLanguage("or-IN", "en-IN")).toBe("od-IN");
    expect(resolveTtsLanguage("fr-FR", "hi-IN")).toBe("hi-IN");
    expect(resolveTtsLanguage(undefined, "en-IN")).toBe("en-IN");
  });

  it("accepts the voice control events", () => {
    expect(parseClientEvent({ type: "session.start", conversationId: "abc" })).toEqual({
      type: "session.start",
      conversationId: "abc",
    });
    expect(parseClientEvent({ type: "audio.start", sampleRate: 16000, channels: 1 }).type).toBe(
      "audio.start",
    );
  });

  it("prefixes colliding MCP tool names", async () => {
    const registry = new ToolRegistry();
    registry.add({
      serverId: "calendar",
      name: "list-events",
      description: "List events",
      inputSchema: {},
      call: async () => "one",
    });
    const second = registry.add({
      serverId: "notes",
      name: "list-events",
      description: "List notes",
      inputSchema: {},
      call: async () => "two",
    });
    expect(registry.list().map((tool) => tool.name)).toEqual(["list-events", second]);
    expect(await registry.call(second, {})).toBe("two");
  });
});
