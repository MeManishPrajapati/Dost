import type { Env } from "../config/env.js";
import type { VisionInput, VisionModelProvider, VisionResponse } from "./provider.js";

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaVisionProvider implements VisionModelProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(env: Env) {
    this.baseUrl = env.ollamaBaseUrl.replace(/\/+$/, "");
    this.model = env.visionModel;
  }

  async analyze(input: VisionInput): Promise<VisionResponse> {
    const body = {
      model: this.model,
      prompt: input.prompt,
      images: [input.image.toString("base64")],
      stream: false,
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Vision provider unavailable: ${message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Vision provider returned ${res.status}: ${text}`);
    }

    const data = (await res.json()) as OllamaGenerateResponse;

    return {
      text: data.response,
      provider: "ollama",
      model: this.model,
      usage: {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      },
    };
  }
}
