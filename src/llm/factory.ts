import type { Env } from "../config/env.js";
import type { LLMProvider } from "./provider.js";
import { OllamaProvider } from "./ollama.js";
import { VertexProvider } from "./vertex.js";

export function createLLMProvider(env: Env): LLMProvider {
  switch (env.llmProvider) {
    case "ollama":
      return new OllamaProvider(env);
    case "vertex":
      return new VertexProvider(env);
    default:
      throw new Error(`Unknown LLM provider: ${env.llmProvider as string}`);
  }
}
