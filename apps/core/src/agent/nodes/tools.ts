import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { DynamicStructuredTool, type StructuredToolInterface } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { ToolRegistry } from "../../mcp/registry.js";
import { jsonSchemaToZod } from "../../mcp/schema.js";
import type { Logger } from "pino";
import { messageText, type ToolCallRecord, type ToolResultRecord } from "../../shared/types.js";
import type { DostState } from "../state.js";

export function langchainToolsFromRegistry(registry: ToolRegistry): StructuredToolInterface[] {
  return registry.list().map((definition) => {
    return new DynamicStructuredTool({
      name: definition.name,
      description: definition.description,
      schema: jsonSchemaToZod(definition.inputSchema),
      func: async (input, _runManager, config) => {
        const args = isRecord(input) ? input : {};
        return definition.call(args, config?.signal);
      },
    });
  });
}

export function createToolsNode(tools: StructuredToolInterface[], logger: Logger) {
  const toolNode = new ToolNode(tools, { handleToolErrors: true });

  return async (state: DostState, config: RunnableConfig) => {
    const last = state.messages.at(-1);
    const calls: ToolCallRecord[] =
      last && AIMessage.isInstance(last)
        ? (last.tool_calls ?? []).map((call) => ({
            id: call.id ?? "",
            name: call.name,
            arguments: isRecord(call.args) ? call.args : {},
          }))
        : [];

    for (const call of calls) {
      logger.info({ tool: call.name }, "tool called");
    }

    const result = (await toolNode.invoke(state, config)) as { messages?: BaseMessage[] };
    const messages = result.messages ?? [];
    const toolResults: ToolResultRecord[] = messages.map((message) => {
      const name = "name" in message && typeof message.name === "string" ? message.name : "";
      logger.info({ tool: name, resultChars: messageText(message.content).length }, "tool completed");
      return {
        id: "tool_call_id" in message && typeof message.tool_call_id === "string" ? message.tool_call_id : "",
        name,
        result: messageText(message.content),
      };
    });

    return {
      messages,
      ...(calls.length > 0 ? { toolCalls: calls } : {}),
      ...(toolResults.length > 0 ? { toolResults } : {}),
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
