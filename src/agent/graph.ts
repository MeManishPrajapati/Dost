import { AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { END, START, StateGraph } from "@langchain/langgraph";
import type { Logger } from "pino";
import type { ToolRegistry } from "../mcp/registry.js";
import { createAgentNode } from "./nodes/agent.js";
import { createToolsNode, langchainToolsFromRegistry } from "./nodes/tools.js";
import { DostAnnotation, type DostState } from "./state.js";

export interface DostGraph {
  stream(
    input: {
      messages: DostState["messages"];
      conversationId: string;
      metadata: DostState["metadata"];
    },
    config?: Record<string, unknown>,
  ): Promise<AsyncIterable<unknown>>;
}

export function createDostGraph(options: {
  model: BaseChatModel;
  registry: ToolRegistry;
  logger: Logger;
  timezone: string;
}): DostGraph {
  const tools = langchainToolsFromRegistry(options.registry);
  const agent = createAgentNode({
    model: options.model,
    tools,
    logger: options.logger,
    timezone: options.timezone,
  });
  const toolsNode = createToolsNode(tools, options.logger);

  const compiled = new StateGraph(DostAnnotation)
    .addNode("agent", agent)
    .addNode("tools", toolsNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeAfterAgent, ["tools", END])
    .addEdge("tools", "agent")
    .compile();

  return {
    async stream(input, config) {
      return compiled.stream(input, config as never) as Promise<AsyncIterable<unknown>>;
    },
  };
}

function routeAfterAgent(state: DostState): "tools" | typeof END {
  const last = state.messages.at(-1);
  if (last && AIMessage.isInstance(last) && (last.tool_calls?.length ?? 0) > 0) return "tools";
  return END;
}
