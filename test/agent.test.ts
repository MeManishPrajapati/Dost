import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { BaseChatModel, type BaseChatModelCallOptions } from "@langchain/core/language_models/chat_models";
import type { ChatResult } from "@langchain/core/outputs";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { createDostGraph } from "../src/agent/graph.js";
import { createAgentRunner } from "../src/agent/runner.js";
import { MemoryConversationRepository } from "../src/memory/repository.js";
import { ToolRegistry } from "../src/mcp/registry.js";

class ScriptedChatModel extends BaseChatModel<BaseChatModelCallOptions> {
  constructor() {
    super({});
  }

  _llmType(): string {
    return "scripted";
  }

  async _generate(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const last = messages.at(-1);
    if (last?.getType() === "tool") {
      const message = new AIMessage("4");
      return { generations: [{ message, text: "4" }] };
    }
    const message = new AIMessage({
      content: "",
      tool_calls: [{ id: "call_1", name: "add", args: { a: 2, b: 2 }, type: "tool_call" }],
    });
    return { generations: [{ message, text: "" }] };
  }
}

describe("LangGraph agent", () => {
  it("calls one tool and returns the final answer", async () => {
    const registry = new ToolRegistry();
    registry.add({
      serverId: "math",
      name: "add",
      description: "Add two numbers",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
      call: async (args) => String(Number(args.a) + Number(args.b)),
    });
    const logger = pino({ level: "silent" });
    const graph = createDostGraph({
      model: new ScriptedChatModel(),
      registry,
      logger,
      timezone: "Asia/Kolkata",
    });
    const conversations = new MemoryConversationRepository();
    const agent = createAgentRunner({
      graph,
      conversations,
      logger,
      historyLimit: 40,
      timeoutMs: 5_000,
    });

    let text = "";
    const events = [];
    for await (const event of agent.run({
      conversationId: "test",
      input: "What is 2 + 2?",
      metadata: { source: "text" },
    })) {
      events.push(event);
      if (event.type === "text.delta") text += event.text;
      if (event.type === "done") text = event.text || text;
    }

    expect(text).toBe("4");
    expect(events.some((event) => event.type === "tool.call" && event.name === "add")).toBe(true);
    expect(events.some((event) => event.type === "tool.result" && event.result === "4")).toBe(true);

    const saved = await conversations.get("test");
    expect(saved?.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(saved?.messages.at(-1)?.content).toBe("4");
  });
});
