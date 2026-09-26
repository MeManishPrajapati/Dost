import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, type AIMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { Logger } from "pino";
import { messageText } from "../../shared/types.js";
import { systemPrompt } from "../prompt.js";
import type { DostState } from "../state.js";

export function createAgentNode(options: {
  model: BaseChatModel;
  tools: StructuredToolInterface[];
  logger: Logger;
  timezone: string;
}) {
  const runnable =
    options.tools.length > 0 && options.model.bindTools
      ? options.model.bindTools(options.tools)
      : options.model;

  return async (state: DostState, config: RunnableConfig) => {
    options.logger.info({ conversationId: state.conversationId }, "LLM started");
    const response = (await runnable.invoke(
      [new SystemMessage(systemPrompt(options.timezone, state.metadata?.source)), ...state.messages],
      { signal: config.signal },
    )) as AIMessage;
    const toolCallCount = response.tool_calls?.length ?? 0;
    options.logger.info(
      { conversationId: state.conversationId, toolCalls: toolCallCount },
      "LLM completed",
    );
    const text = messageText(response.content);
    return {
      messages: [response],
      ...(toolCallCount === 0 ? { agentResponse: text } : {}),
    };
  };
}
