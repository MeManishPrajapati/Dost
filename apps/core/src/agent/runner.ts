import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { fromBaseMessage, toBaseMessage, trimHistory, type StoredMessage } from "../memory/conversation.js";
import type { ConversationRepository } from "../memory/repository.js";
import type { Logger } from "pino";
import { isAbortError } from "../shared/errors.js";
import {
  messageText,
  type AgentInput,
  type AgentRunOptions,
  type AgentRunner,
  type AgentStreamEvent,
} from "../shared/types.js";
import type { DostGraph } from "./graph.js";

export function createAgentRunner(options: {
  graph: DostGraph;
  conversations: ConversationRepository;
  logger: Logger;
  historyLimit: number;
  timeoutMs: number;
}): AgentRunner {
  return {
    run(input, runOptions) {
      return runAgent(options, input, runOptions);
    },
  };
}

async function* runAgent(
  options: {
    graph: DostGraph;
    conversations: ConversationRepository;
    logger: Logger;
    historyLimit: number;
    timeoutMs: number;
  },
  input: AgentInput,
  runOptions?: AgentRunOptions,
): AsyncGenerator<AgentStreamEvent> {
  const { logger } = options;
  logger.info({ source: input.metadata?.source, language: input.metadata?.language }, "agent started");
  yield { type: "status", status: "thinking" };

  const history = await options.conversations.get(input.conversationId);
  const prior = trimHistory(history?.messages ?? [], options.historyLimit).map(toBaseMessage);
  const userMessage: StoredMessage = {
    role: "user",
    content: input.input,
    createdAt: new Date(),
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
  };
  await options.conversations.append(
    input.conversationId,
    [userMessage],
    input.metadata
      ? {
          source: input.metadata.source,
          ...(input.metadata.language ? { language: input.metadata.language } : {}),
        }
      : undefined,
  );

  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const signal = runOptions?.signal ? AbortSignal.any([runOptions.signal, timeoutSignal]) : timeoutSignal;
  let streamed = "";
  let responded = false;
  let latestMessages: BaseMessage[] = [];
  const seenToolCalls = new Set<string>();
  const seenToolResults = new Set<string>();

  try {
    const stream = await options.graph.stream(
      {
        messages: [...prior, toBaseMessage(userMessage)],
        conversationId: input.conversationId,
        metadata: input.metadata ?? { source: "text" },
      },
      {
        streamMode: ["messages", "updates", "values"],
        signal,
        recursionLimit: 24,
      },
    );

    for await (const item of stream) {
      if (signal.aborted) break;
      for (const event of interpretStreamItem(item, {
        streamed,
        responded,
        seenToolCalls,
        seenToolResults,
        onMessages(messages) {
          latestMessages = messages;
        },
        onText(next) {
          streamed = next;
        },
        onResponded() {
          responded = true;
        },
      })) {
        yield event;
      }
    }
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      if (runOptions?.signal?.aborted) {
        await persistGenerated(options.conversations, input.conversationId, prior.length + 1, latestMessages, streamed);
        yield { type: "done", text: streamed, cancelled: true };
        return;
      }
      logger.error({ err: error }, "agent timed out");
      yield { type: "error", code: "agent_timeout", message: "The assistant took too long to respond." };
      return;
    }
    logger.error({ err: error }, "agent failed");
    const mapped = mapAgentError(error);
    yield { type: "error", code: mapped.code, message: mapped.message };
    return;
  }

  const text = finalText(latestMessages, streamed);
  await persistGenerated(options.conversations, input.conversationId, prior.length + 1, latestMessages, text);
  yield { type: "done", text };
}

function interpretStreamItem(
  item: unknown,
  state: {
    streamed: string;
    responded: boolean;
    seenToolCalls: Set<string>;
    seenToolResults: Set<string>;
    onMessages(messages: BaseMessage[]): void;
    onText(next: string): void;
    onResponded(): void;
  },
): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];
  const [mode, data] = streamTuple(item);
  if (mode === "values" && isRecord(data) && Array.isArray(data.messages)) {
    state.onMessages(data.messages.filter(isBaseMessage));
    return events;
  }
  if (mode === "updates" && isRecord(data)) {
    events.push(...toolEventsFromUpdate(data, state.seenToolCalls, state.seenToolResults));
    return events;
  }
  if (mode === "messages" && Array.isArray(data)) {
    const message = data[0];
    const metadata = isRecord(data[1]) ? data[1] : undefined;
    if (!isBaseMessage(message)) return events;
    const node = metadata?.langgraph_node;
    if (typeof node === "string" && node !== "agent") return events;
    if (!isSpokenChunk(message)) return events;
    const delta = messageText(message.content);
    const next = mergeStreamText(state.streamed, delta);
    const suffix = next.slice(state.streamed.length);
    state.onText(next);
    if (!suffix) return events;
    if (!state.responded) {
      state.onResponded();
      events.push({ type: "status", status: "responding" });
    }
    events.push({ type: "text.delta", text: suffix });
  }
  return events;
}

function toolEventsFromUpdate(
  update: Record<string, unknown>,
  seenToolCalls: Set<string>,
  seenToolResults: Set<string>,
): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];
  const agentUpdate = isRecord(update.agent) ? update.agent : undefined;
  const agentMessages = Array.isArray(agentUpdate?.messages) ? agentUpdate.messages.filter(isBaseMessage) : [];
  for (const message of agentMessages) {
    if (!AIMessage.isInstance(message)) continue;
    for (const call of message.tool_calls ?? []) {
      const id = call.id ?? `${call.name}:${JSON.stringify(call.args)}`;
      if (seenToolCalls.has(id)) continue;
      seenToolCalls.add(id);
      events.push({
        type: "tool.call",
        name: call.name,
        arguments: isRecord(call.args) ? call.args : {},
      });
    }
  }

  const toolsUpdate = isRecord(update.tools) ? update.tools : undefined;
  const toolMessages = Array.isArray(toolsUpdate?.messages) ? toolsUpdate.messages.filter(isBaseMessage) : [];
  for (const message of toolMessages) {
    if (message.getType() !== "tool") continue;
    const id = "tool_call_id" in message && typeof message.tool_call_id === "string" ? message.tool_call_id : "";
    if (id && seenToolResults.has(id)) continue;
    if (id) seenToolResults.add(id);
    const name = "name" in message && typeof message.name === "string" ? message.name : "";
    events.push({ type: "tool.result", name, result: messageText(message.content) });
  }
  return events;
}

function streamTuple(item: unknown): [string, unknown] {
  if (Array.isArray(item) && typeof item[0] === "string" && item.length === 2) {
    return [item[0], item[1]];
  }
  return ["", item];
}

function isSpokenChunk(message: BaseMessage): boolean {
  if (message.getType() !== "ai") return false;
  const toolChunks = (message as { tool_call_chunks?: unknown[] }).tool_call_chunks;
  if (Array.isArray(toolChunks) && toolChunks.length > 0) return false;
  if (AIMessage.isInstance(message) && (message.tool_calls?.length ?? 0) > 0 && !messageText(message.content)) {
    return false;
  }
  return true;
}

function mergeStreamText(accumulated: string, delta: string): string {
  if (!delta) return accumulated;
  if (delta.startsWith(accumulated)) return delta;
  return accumulated + delta;
}

function finalText(messages: BaseMessage[], streamed: string): string {
  if (streamed.trim()) return streamed;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || !AIMessage.isInstance(message)) continue;
    if ((message.tool_calls?.length ?? 0) > 0) continue;
    return messageText(message.content);
  }
  return streamed;
}

async function persistGenerated(
  conversations: ConversationRepository,
  conversationId: string,
  seededCount: number,
  latestMessages: BaseMessage[],
  fallbackText: string,
): Promise<void> {
  const generated = latestMessages.slice(seededCount);
  const stored = generated
    .map((message) => fromBaseMessage(message))
    .filter((message): message is StoredMessage => message !== null && message.role !== "user")
    .filter((message) => message.role !== "assistant" || message.content.trim() || (message.toolCalls?.length ?? 0) > 0);

  if (stored.length > 0) {
    await conversations.append(conversationId, stored);
    return;
  }
  if (!fallbackText.trim()) return;
  await conversations.append(conversationId, [
    { role: "assistant", content: fallbackText, createdAt: new Date() },
  ]);
}

function mapAgentError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : "The assistant failed to respond.";
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|other side closed/i.test(message)) {
    return { code: "llm_unavailable", message: "The language model is not reachable." };
  }
  return { code: "agent_error", message: "The assistant failed to respond." };
}

function isBaseMessage(value: unknown): value is BaseMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "getType" in value &&
    typeof (value as { getType?: unknown }).getType === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
