import type { Env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import { abortError, openWebSocket, socketDataToString } from "../socket.js";
import type { TTSCallbacks, TTSProvider, TTSSession, TTSSessionOptions } from "./provider.js";

// Sarvam TTS accepts: Latin, Devanagari, Gujarati, Bengali, Kannada, Malayalam,
// Tamil, Telugu, Odia, Gurmukhi, digits, whitespace, and basic punctuation.
// Strip everything else (emoji, CJK, markdown symbols, etc.) so the API doesn't reject the text.
const ALLOWED_TTS_CHARS =
  /[^\p{Script=Latin}\p{Script=Devanagari}\p{Script=Gujarati}\p{Script=Bengali}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Oriya}\p{Script=Gurmukhi}0-9\s.,;:!?'"()\-–—…।॥]/gu;

function sanitizeForTts(text: string): string {
  return text.replace(ALLOWED_TTS_CHARS, "").replace(/\s{2,}/g, " ").trim();
}

export function buildSarvamTtsUrl(env: Env): string {
  const params = new URLSearchParams({
    model: env.sarvamTtsModel,
    send_completion_event: "true",
  });
  return `wss://api.sarvam.ai/text-to-speech/ws?${params.toString()}`;
}

export function sarvamTtsConfig(env: Env, languageCode: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    model: env.sarvamTtsModel,
    language_code: languageCode,
    speaker: env.sarvamTtsSpeaker.toLowerCase(),
    pace: 1,
    speech_sample_rate: String(env.sarvamTtsSampleRate),
    output_audio_codec: env.sarvamTtsCodec,
    output_audio_bitrate: "128k",
    enable_preprocessing: true,
    min_buffer_size: 30,
    max_chunk_length: 200,
  };
  if (env.sarvamTtsModel === "bulbul:v3") data.temperature = 0.6;
  return { type: "config", data };
}

export function createSarvamTTS(env: Env): TTSProvider {
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
        buildSarvamTtsUrl(env),
        { "api-subscription-key": env.sarvamApiKey },
        options.signal,
        (data) => consumer(data),
      );
      const session = new SarvamTtsSession(socket, callbacks, options.signal);
      consumer = (data) => {
        void session.receive(data);
      };
      for (const message of inbox.splice(0)) consumer(message);
      await session.configure(sarvamTtsConfig(env, options.languageCode));
      return session;
    },
  };
}

interface FlushWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

class SarvamTtsSession implements TTSSession {
  private chain: Promise<void> = Promise.resolve();
  private readonly completions: FlushWaiter[] = [];
  private closed = false;
  private readonly ping: ReturnType<typeof setInterval>;

  constructor(
    private readonly socket: WebSocket,
    private readonly callbacks: TTSCallbacks,
    private readonly signal?: AbortSignal,
  ) {
    this.socket.addEventListener("error", () => {
      this.fail(new Error("Sarvam TTS connection failed"));
    });
    this.socket.addEventListener("close", () => {
      if (this.closed) return;
      this.fail(new Error("Sarvam TTS connection closed"));
    });
    this.signal?.addEventListener("abort", () => {
      void this.close();
    }, { once: true });
    this.ping = setInterval(() => {
      void this.enqueue({ type: "ping" }).catch(() => undefined);
    }, 15_000);
  }

  async configure(payload: unknown): Promise<void> {
    await this.enqueue(payload);
  }

  async sendText(text: string): Promise<void> {
    const cleaned = sanitizeForTts(text);
    if (!cleaned) return;
    this.throwIfStopped();
    await this.enqueue({ type: "text", data: { text: cleaned } });
  }

  async flush(): Promise<void> {
    this.throwIfStopped();
    await this.enqueue({ type: "flush" });
    await new Promise<void>((resolve, reject) => {
      const waiter: FlushWaiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      const timer = setTimeout(() => {
        const index = this.completions.indexOf(waiter);
        if (index >= 0) this.completions.splice(index, 1);
        reject(new Error("Sarvam TTS flush timed out"));
      }, 30_000);
      this.completions.push(waiter);
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.ping);
    this.rejectPending(abortError());
    this.socket.close();
  }

  private enqueue(payload: unknown): Promise<void> {
    const run = this.chain.then(() => this.sendNow(payload));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async sendNow(payload: unknown): Promise<void> {
    this.throwIfStopped();
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Sarvam TTS socket is closed");
    }
    this.socket.send(JSON.stringify(payload));
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
    if (!payload || typeof payload !== "object" || !("type" in payload)) return;
    const message = payload as { type?: string; data?: Record<string, unknown> };
    if (message.type === "audio" && message.data) {
      const audio = message.data.audio;
      if (typeof audio !== "string" || !audio) return;
      const contentType = typeof message.data.content_type === "string" ? message.data.content_type : "audio/mpeg";
      this.callbacks.onAudio(Buffer.from(audio, "base64"), contentType);
      return;
    }
    if (message.type === "event" && message.data?.event_type === "final") {
      this.completions.shift()?.resolve();
      return;
    }
    if (message.type === "error") {
      const text = typeof message.data?.message === "string" ? message.data.message : "Sarvam TTS error";
      this.fail(new Error(text));
    }
  }

  private throwIfStopped(): void {
    if (this.signal?.aborted) throw abortError();
    if (this.closed) throw new Error("Sarvam TTS session is closed");
  }

  private fail(error: Error): void {
    if (!this.closed) {
      this.closed = true;
      clearInterval(this.ping);
      this.socket.close();
    }
    this.rejectPending(error);
    if (error.name !== "AbortError") this.callbacks.onError(error);
  }

  private rejectPending(error: Error): void {
    while (this.completions.length > 0) this.completions.shift()?.reject(error);
  }
}
