import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export interface ChatTurn {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface LLMCallOptions {
  signal?: AbortSignal;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResult {
  text: string;
  toolCalls: LLMToolCall[];
}

export interface LLMStreamChunk {
  text: string;
}

export interface LLMProvider {
  chat(messages: ChatTurn[], options?: LLMCallOptions): Promise<LLMResult>;
  stream(messages: ChatTurn[], options?: LLMCallOptions): AsyncIterable<LLMStreamChunk>;
  /**
   * LangChain chat model used only by the LangGraph agent node.
   * Transports depend on {@link LLMProvider}, not on this model.
   */
  bindableModel(): BaseChatModel;
}
