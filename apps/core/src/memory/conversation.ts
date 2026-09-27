import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { messageText, type ToolCallRecord } from "../shared/types.js";

export interface StoredMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: Date;
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  conversationId: string;
  createdAt: Date;
  updatedAt: Date;
  messages: StoredMessage[];
  metadata?: Record<string, unknown>;
}

export function toBaseMessage(message: StoredMessage): BaseMessage {
  if (message.role === "user") return new HumanMessage(message.content);
  if (message.role === "tool") {
    return new ToolMessage({
      content: message.content,
      tool_call_id: message.toolCallId ?? "unknown",
      name: message.toolName,
    });
  }
  return new AIMessage({
    content: message.content,
    tool_calls: message.toolCalls?.map((call) => ({
      id: call.id,
      name: call.name,
      args: call.arguments,
      type: "tool_call" as const,
    })),
  });
}

export function fromBaseMessage(message: BaseMessage, now = new Date()): StoredMessage | null {
  const type = message.getType();
  if (type === "human") {
    return { role: "user", content: messageText(message.content), createdAt: now };
  }
  if (type === "ai") {
    const ai = message as AIMessage;
    const toolCalls = (ai.tool_calls ?? []).map((call) => ({
      id: call.id ?? "",
      name: call.name,
      arguments: isRecord(call.args) ? call.args : {},
    }));
    return {
      role: "assistant",
      content: messageText(ai.content),
      createdAt: now,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }
  if (type === "tool") {
    const tool = message as ToolMessage;
    return {
      role: "tool",
      content: messageText(tool.content),
      createdAt: now,
      toolCallId: tool.tool_call_id,
      ...(tool.name ? { toolName: tool.name } : {}),
    };
  }
  return null;
}

export function trimHistory(messages: StoredMessage[], limit: number): StoredMessage[] {
  const sliced = messages.slice(-limit);
  while (sliced[0]?.role === "tool") sliced.shift();
  return sliced;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
