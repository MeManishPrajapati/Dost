import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";
import type { Env } from "../config/env.js";
import { messageText } from "../shared/types.js";
import type { ChatTurn, LLMProvider, LLMResult, LLMStreamChunk } from "./provider.js";

export class OllamaProvider implements LLMProvider {
  private readonly model: ChatOllama;

  constructor(env: Env) {
    this.model = new ChatOllama({
      model: env.ollamaModel,
      baseUrl: env.ollamaBaseUrl,
      temperature: env.ollamaTemperature,
      streaming: true,
    });
  }

  bindableModel(): ChatOllama {
    return this.model;
  }

  async chat(messages: ChatTurn[], options?: { signal?: AbortSignal }): Promise<LLMResult> {
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
    options?: { signal?: AbortSignal },
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

function toBaseMessages(messages: ChatTurn[]): BaseMessage[] {
  return messages.map((message) => {
    if (message.role === "system") return new SystemMessage(message.content);
    if (message.role === "user") return new HumanMessage(message.content);
    if (message.role === "tool") {
      return new ToolMessage({
        content: message.content,
        tool_call_id: message.toolCallId ?? "unknown",
        name: message.name,
      });
    }
    return new AIMessage(message.content);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
