import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { AgentMetadata, ToolCallRecord, ToolResultRecord } from "../shared/types.js";

export const DostAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  conversationId: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  metadata: Annotation<AgentMetadata>({
    reducer: (_left, right) => right,
    default: () => ({ source: "text" }),
  }),
  toolCalls: Annotation<ToolCallRecord[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  toolResults: Annotation<ToolResultRecord[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  agentResponse: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
});

export type DostState = typeof DostAnnotation.State;
