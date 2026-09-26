import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatTurn } from "./provider.js";

export function toBaseMessages(messages: ChatTurn[]): BaseMessage[] {
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
