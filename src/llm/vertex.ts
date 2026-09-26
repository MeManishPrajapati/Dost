import { ChatVertexAI } from "@langchain/google-vertexai";
import type { Env } from "../config/env.js";
import { messageText } from "../shared/types.js";
import type { ChatTurn, LLMCallOptions, LLMProvider, LLMResult, LLMStreamChunk } from "./provider.js";
import { toBaseMessages } from "./messages.js";

export class VertexProvider implements LLMProvider {
  private readonly model: ChatVertexAI;

  constructor(env: Env) {
    if (!env.googleApplicationCredentials && !env.vertexProject) {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS or VERTEX_PROJECT is required when LLM_PROVIDER=vertex",
      );
    }
    this.model = new ChatVertexAI({
      model: env.vertexModel,
      location: env.vertexLocation,
      temperature: env.vertexTemperature,
      streaming: true,
      ...(env.vertexProject ? { authOptions: { projectId: env.vertexProject } } : {}),
    });
  }

  bindableModel(): ChatVertexAI {
    return this.model;
  }

  async chat(messages: ChatTurn[], options?: LLMCallOptions): Promise<LLMResult> {
    const response = await this.model.invoke(toBaseMessages(messages), {
      signal: options?.signal,
    });
    return {
      text: messageText(response.content),
      toolCalls: (response.tool_calls ?? []).map((call) => ({
        id: call.id ?? "",
        name: call.name,
        arguments: isRecord(call.args) ? call.args : {},
      })),
    };
  }

  async *stream(
    messages: ChatTurn[],
    options?: LLMCallOptions,
  ): AsyncIterable<LLMStreamChunk> {
    const stream = await this.model.stream(toBaseMessages(messages), {
      signal: options?.signal,
    });
    for await (const chunk of stream) {
      const text = messageText(chunk.content);
      if (text) yield { text };
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
