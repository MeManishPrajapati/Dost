import pino from "pino";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import type { AgentRunner } from "../src/shared/types.js";
import type { ServerEvent } from "../src/shared/events.js";
import { VoiceSession, type VoiceSocket } from "../src/transport/websocket/voice-session.js";
import type { STTCallbacks, STTProvider } from "../src/voice/stt/provider.js";
import type { TTSProvider } from "../src/voice/tts/provider.js";

describe("voice session", () => {
  it("sends partials to the client and only runs the agent on the final transcript", async () => {
    const env = loadEnv({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    const sent: ServerEvent[] = [];
    const socket: VoiceSocket = {
      readyState: 1,
      send(data: string) {
        sent.push(JSON.parse(data) as ServerEvent);
      },
      close() {
        this.readyState = 3;
      },
    };
    let runs = 0;
    let callbacks: STTCallbacks | null = null;
    const spoken: string[] = [];
    const stt: STTProvider = {
      async startSession(_options, next) {
        callbacks = next;
        return {
          sendAudio() {},
          beginUtterance() {},
          endUtterance() {
            next.onFinal({ text: "What is 2 + 2?", language: "en-IN" });
          },
          async close() {},
        };
      },
    };
    const tts: TTSProvider = {
      async startSession(_options, ttsCallbacks) {
        return {
          async sendText(text: string) {
            spoken.push(text);
            ttsCallbacks.onAudio(Buffer.from("audio-bytes"), "audio/mpeg");
          },
          async flush() {},
          async close() {},
        };
      },
    };
    const agent: AgentRunner = {
      async *run(input) {
        runs += 1;
        expect(input.metadata?.source).toBe("voice");
        expect(input.input).toBe("What is 2 + 2?");
        yield { type: "status", status: "thinking" };
        yield { type: "text.delta", text: "Hello." };
        yield { type: "done", text: "Hello." };
      },
    };
    const session = new VoiceSession(socket, {
      env,
      logger: pino({ level: "silent" }),
      agent,
      stt,
      tts,
    });

    await session.handleMessage(JSON.stringify({ type: "session.start", conversationId: "abc" }), false);
    await session.handleMessage(JSON.stringify({ type: "audio.start", sampleRate: 16000, channels: 1 }), false);
    callbacks?.onPartial({ text: "What is", language: "en-IN" });
    expect(runs).toBe(0);
    expect(sent.some((event) => event.type === "transcript.partial")).toBe(true);

    await session.handleMessage(Buffer.from([1, 2, 3, 4]), true);
    await session.handleMessage(JSON.stringify({ type: "audio.stop" }), false);
    await waitFor(() => sent.some((event) => event.type === "response.done"));

    expect(runs).toBe(1);
    expect(spoken).toEqual(["Hello."]);
    expect(sent.some((event) => event.type === "response.text.delta" && event.text === "Hello.")).toBe(true);
    expect(sent.some((event) => event.type === "response.audio.delta" && event.audio.length > 0)).toBe(true);
    await session.close();
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2_000) throw new Error("timed out waiting for the voice turn");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
