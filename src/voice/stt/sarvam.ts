import type { Env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import { abortError, openWebSocket, socketDataToString } from "../socket.js";
import type { STTCallbacks, STTProvider, STTSession, STTSessionOptions } from "./provider.js";

export function buildSarvamSttUrl(env: Env, sampleRate: number): string {
  const params = new URLSearchParams({
    language_code: env.sarvamSttLanguage,
    model: env.sarvamSttModel,
    stream_type: env.sarvamSttStreamType,
    mode: env.sarvamSttMode,
    endpointing: env.sarvamSttEndpointing,
    encoding: "linear16",
    sample_rate: String(sampleRate),
  });
  return `wss://api.sarvam.ai/speech-to-text-realtime/ws?${params.toString()}`;
}

export function createSarvamSTT(env: Env): STTProvider {
  return {
    async startSession(options, callbacks) {
      if (!env.sarvamApiKey) {
        throw new AppError("voice_not_configured", "SARVAM_API_KEY is not configured", 503);
      }
      const inbox: unknown[] = [];
      let consumer = (data: unknown) => {
        inbox.push(data);
      };
      const socket = await openWebSocket(
        buildSarvamSttUrl(env, options.sampleRate),
        { "api-subscription-key": env.sarvamApiKey },
        options.signal,
        (data) => consumer(data),
      );
      const session = new SarvamSttSession(socket, env.sarvamSttEndpointing, callbacks, options.signal);
      consumer = (data) => {
        void session.receive(data);
      };
      for (const message of inbox.splice(0)) consumer(message);
      return session;
    },
  };
}

class SarvamSttSession implements STTSession {
  private readonly queue: string[] = [];
  private closed = false;
  private readonly ping: ReturnType<typeof setInterval>;

  constructor(
    private readonly socket: WebSocket,
    private readonly endpointing: Env["sarvamSttEndpointing"],
    private readonly callbacks: STTCallbacks,
    signal?: AbortSignal,
  ) {
    this.socket.addEventListener("close", () => {
      this.closed = true;
    });
    this.socket.addEventListener("error", () => {
      this.callbacks.onError(new Error("Sarvam STT connection failed"));
    });
    signal?.addEventListener("abort", () => {
      void this.close();
    }, { once: true });
    this.ping = setInterval(() => {
      this.send({ event: "ping" });
    }, 15_000);
  }

  sendAudio(chunk: Buffer): void {
    if (!chunk.length) return;
    this.send({ event: "audio_input", audio: chunk.toString("base64") });
  }

  beginUtterance(): void {
    if (this.endpointing !== "manual") return;
    this.send({ event: "speech_start" });
  }

  endUtterance(): void {
    if (this.endpointing !== "manual") return;
    this.send({ event: "speech_end" });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.ping);
    this.send({ event: "end" });
    this.socket.close();
  }

  private send(payload: unknown): void {
    const json = JSON.stringify(payload);
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(json);
      return;
    }
    if (this.queue.length < 256) this.queue.push(json);
  }

  receive(data: unknown): Promise<void> {
    return this.onMessage(data);
  }

  private async onMessage(data: unknown): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(await socketDataToString(data)) as unknown;
    } catch {
      return;
    }
    const event = readEvent(payload);
    if (!event) return;
    if (event.event === "session.begin") {
      this.flushQueue();
      return;
    }
    if (event.event === "transcript.partial") {
      const text = readString(event.text);
      if (!text) return;
      this.callbacks.onPartial({ text, language: readString(event.language) });
      return;
    }
    if (event.event === "transcript.final") {
      const text = readString(event.text);
      if (!text) return;
      this.callbacks.onFinal({ text, language: readString(event.language) });
      return;
    }
    if (event.event === "vad.speech_start") {
      this.callbacks.onSpeechStart?.();
      return;
    }
    if (event.event === "error") {
      const error = new Error(readString(event.message) ?? "Sarvam STT error");
      this.callbacks.onError(error);
      if (event.is_fatal === true) await this.close();
    }
  }

  private flushQueue(): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    for (const message of this.queue.splice(0)) this.socket.send(message);
  }
}

function readEvent(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || !("event" in payload)) return null;
  return payload as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function sttAbortError(): Error {
  return abortError();
}
