import { describe, expect, it, vi } from "vitest";
import { OllamaVisionProvider } from "../src/vision/ollama.js";
import type { Env } from "../src/config/env.js";

function makeEnv(overrides?: Partial<Env>): Env {
  return {
    ollamaBaseUrl: "http://127.0.0.1:11434",
    visionModel: "gemma3",
    visionProvider: "ollama",
    visionMaxImageBytes: 5_242_880,
    ...overrides,
  } as Env;
}

describe("OllamaVisionProvider", () => {
  it("sends the correct request format to Ollama", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: "This is an HP laptop",
        done: true,
        prompt_eval_count: 100,
        eval_count: 20,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new OllamaVisionProvider(makeEnv());
    const image = Buffer.from("fake-image-data");
    const result = await provider.analyze({
      image,
      mimeType: "image/jpeg",
      prompt: "What laptop is this?",
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:11434/api/generate");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("gemma3");
    expect(body.prompt).toBe("What laptop is this?");
    expect(body.images).toEqual([image.toString("base64")]);
    expect(body.stream).toBe(false);

    expect(result).toEqual({
      text: "This is an HP laptop",
      provider: "ollama",
      model: "gemma3",
      usage: { inputTokens: 100, outputTokens: 20 },
    });

    vi.unstubAllGlobals();
  });

  it("uses the configured model and base URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "ok", done: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new OllamaVisionProvider(
      makeEnv({ ollamaBaseUrl: "http://10.0.0.5:11434/", visionModel: "llava" }),
    );
    await provider.analyze({ image: Buffer.alloc(1), mimeType: "image/png", prompt: "test" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://10.0.0.5:11434/api/generate");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("llava");

    vi.unstubAllGlobals();
  });

  it("throws a descriptive error when Ollama is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    const provider = new OllamaVisionProvider(makeEnv());
    await expect(
      provider.analyze({ image: Buffer.alloc(1), mimeType: "image/jpeg", prompt: "test" }),
    ).rejects.toThrow(/Vision provider unavailable/);

    vi.unstubAllGlobals();
  });

  it("throws when Ollama returns a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "model not found",
      }),
    );

    const provider = new OllamaVisionProvider(makeEnv());
    await expect(
      provider.analyze({ image: Buffer.alloc(1), mimeType: "image/jpeg", prompt: "test" }),
    ).rejects.toThrow(/Vision provider returned 404/);

    vi.unstubAllGlobals();
  });
});
