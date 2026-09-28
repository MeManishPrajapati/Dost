import type { Env } from "../config/env.js";
import { OllamaVisionProvider } from "./ollama.js";
import type { VisionModelProvider } from "./provider.js";

export function createVisionProvider(env: Env): VisionModelProvider {
  switch (env.visionProvider) {
    case "ollama":
      return new OllamaVisionProvider(env);
    default:
      throw new Error(`Unsupported vision provider: ${env.visionProvider as string}`);
  }
}
