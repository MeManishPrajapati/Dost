import { z } from "zod";

export const clientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.start"),
    conversationId: z.string().trim().min(1).max(200),
  }),
  z.object({
    type: z.literal("audio.start"),
    sampleRate: z.union([z.literal(8000), z.literal(16000)]),
    channels: z.literal(1),
  }),
  z.object({
    type: z.literal("audio.stop"),
  }),
]);

export type ClientEvent = z.infer<typeof clientEventSchema>;

export type ServerEvent =
  | {
      type: "session.ready";
      sessionId: string;
      conversationId: string;
    }
  | {
      type: "transcript.partial";
      text: string;
      language?: string;
    }
  | {
      type: "transcript.final";
      text: string;
      language?: string;
    }
  | {
      type: "agent.status";
      status: "thinking" | "responding";
    }
  | {
      type: "tool.call";
      name: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: "tool.result";
      name: string;
      result: unknown;
    }
  | {
      type: "response.text.delta";
      text: string;
    }
  | {
      type: "response.audio.delta";
      audio: string;
      contentType?: string;
    }
  | { type: "response.done" }
  | {
      type: "error";
      code: string;
      message: string;
    };

export function parseClientEvent(payload: unknown): ClientEvent {
  return clientEventSchema.parse(payload);
}
