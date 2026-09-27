export type InputSource = "text" | "voice";

export interface AgentMetadata {
  source: InputSource;
  language?: string;
}

export interface AgentInput {
  conversationId: string;
  input: string;
  metadata?: AgentMetadata;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultRecord {
  id: string;
  name: string;
  result: string;
}

export type AgentStatusName = "thinking" | "responding";

export type AgentStreamEvent =
  | { type: "status"; status: AgentStatusName }
  | { type: "tool.call"; name: string; arguments: Record<string, unknown> }
  | { type: "tool.result"; name: string; result: string }
  | { type: "text.delta"; text: string }
  | { type: "done"; text: string; cancelled?: boolean }
  | { type: "error"; code: string; message: string };

export interface AgentRunOptions {
  signal?: AbortSignal;
}

export interface AgentRunner {
  run(input: AgentInput, options?: AgentRunOptions): AsyncIterable<AgentStreamEvent>;
}

export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("");
}

export function asJsonIfPossible(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}
