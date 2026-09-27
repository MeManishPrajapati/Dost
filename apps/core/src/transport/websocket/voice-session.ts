import { randomUUID } from "node:crypto";
import type { Env } from "../../config/env.js";
import type { AgentRunner } from "../../shared/types.js";
import { asJsonIfPossible } from "../../shared/types.js";
import { AppError } from "../../shared/errors.js";
import { ZodError } from "zod";
import { parseClientEvent, type ServerEvent } from "../../shared/events.js";
import type { AppLogger } from "../../server/logger.js";
import { requestContext } from "../../server/context.js";
import { SentenceBuffer } from "../../voice/sentence-buffer.js";
import { resolveTtsLanguage } from "../../voice/language.js";
import type { STTProvider, STTSession } from "../../voice/stt/provider.js";
import type { TTSProvider, TTSSession } from "../../voice/tts/provider.js";

export interface VoiceSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
}

const SOCKET_OPEN = 1;
const MAX_AUDIO_CHUNK = 256 * 1024;

export class VoiceSession {
  private readonly sessionId = randomUUID();
  private readonly sessionAbort = new AbortController();
  private conversationId: string | null = null;
  private sttSession: STTSession | null = null;
  private sampleRate: number | null = null;
  private acceptingAudio = false;
  private generation = 0;
  private turnAbort: AbortController | null = null;
  private closed = false;

  constructor(
    private readonly socket: VoiceSocket,
    private readonly deps: {
      env: Env;
      logger: AppLogger;
      agent: AgentRunner;
      stt: STTProvider;
      tts: TTSProvider;
    },
  ) {}

  async handleMessage(data: Buffer | ArrayBuffer | Buffer[] | string, isBinary: boolean): Promise<void> {
    if (this.closed) return;
    if (isBinary) {
      this.onAudio(toBuffer(data));
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(toBuffer(data).toString("utf8")) as unknown;
    } catch {
      this.send({ type: "error", code: "invalid_message", message: "Expected a JSON control message." });
      return;
    }
    try {
      const event = parseClientEvent(payload);
      if (event.type === "session.start") {
        await this.onSessionStart(event.conversationId);
        return;
      }
      if (event.type === "audio.start") {
        await this.onAudioStart(event.sampleRate);
        return;
      }
      await this.onAudioStop();
    } catch (error) {
      if (error instanceof ZodError) {
        this.send({
          type: "error",
          code: "invalid_message",
          message: error.issues.map((issue) => issue.message).join("; "),
        });
        return;
      }
      this.fail(error);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.sessionAbort.abort();
    this.cancelActiveTurn();
    await this.sttSession?.close();
    this.sttSession = null;
  }

  private async onSessionStart(conversationId: string): Promise<void> {
    if (this.conversationId) {
      this.send({ type: "error", code: "session_already_started", message: "The voice session is already started." });
      return;
    }
    this.conversationId = conversationId;
    this.deps.logger.info({ sessionId: this.sessionId, conversationId }, "voice session started");
    this.send({ type: "session.ready", sessionId: this.sessionId, conversationId });
  }

  private async onAudioStart(sampleRate: number): Promise<void> {
    if (!this.conversationId) {
      this.send({ type: "error", code: "session_not_started", message: "Send session.start before audio." });
      return;
    }
    if (this.turnAbort) this.cancelActiveTurn();
    await this.ensureStt(sampleRate);
    this.acceptingAudio = true;
    this.sttSession?.beginUtterance();
  }

  private onAudio(chunk: Buffer): void {
    if (!this.acceptingAudio || !this.sttSession) {
      this.send({ type: "error", code: "audio_not_started", message: "Send audio.start before audio frames." });
      return;
    }
    if (chunk.length > MAX_AUDIO_CHUNK) {
      this.send({ type: "error", code: "audio_chunk_too_large", message: "Audio frame exceeds 256KB." });
      return;
    }
    this.sttSession.sendAudio(chunk);
  }

  private async onAudioStop(): Promise<void> {
    if (!this.acceptingAudio) return;
    this.acceptingAudio = false;
    this.sttSession?.endUtterance();
  }

  private async ensureStt(sampleRate: number): Promise<void> {
    if (this.sttSession && this.sampleRate === sampleRate) return;
    await this.sttSession?.close();
    this.sampleRate = sampleRate;
    this.deps.logger.info({ sampleRate, sessionId: this.sessionId }, "STT started");
    this.sttSession = await this.deps.stt.startSession(
      { sampleRate, signal: this.sessionAbort.signal },
      {
        onPartial: (transcript) => {
          this.send({
            type: "transcript.partial",
            text: transcript.text,
            ...(transcript.language ? { language: transcript.language } : {}),
          });
        },
        onFinal: (transcript) => {
          if (!transcript.text.trim()) return;
          this.deps.logger.info(
            { text: transcript.text, language: transcript.language },
            "STT final",
          );
          this.send({
            type: "transcript.final",
            text: transcript.text,
            ...(transcript.language ? { language: transcript.language } : {}),
          });
          void this.startTurn(transcript.text, transcript.language);
        },
        onSpeechStart: () => {
          if (this.turnAbort) this.cancelActiveTurn();
        },
        onError: (error) => this.fail(error),
      },
    );
  }

  private async startTurn(text: string, language?: string): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId || this.closed) return;
    this.cancelActiveTurn();
    this.generation += 1;
    const generation = this.generation;
    const abort = new AbortController();
    this.turnAbort = abort;
    const requestId = randomUUID();
    const ttsLanguage = resolveTtsLanguage(language, this.deps.env.sarvamTtsLanguage);

    await requestContext.run(
      { requestId, conversationId, sessionId: this.sessionId },
      async () => {
        const logger = this.deps.logger;
        logger.info("request received");
        const emit = (event: ServerEvent) => {
          if (generation !== this.generation) return;
          this.send(event);
        };
        emit({ type: "agent.status", status: "thinking" });

        const buffer = new SentenceBuffer();
        const playback = { session: null as TTSSession | null };
        let ttsFailed = false;
        const ttsReady = this.deps.tts
          .startSession(
            { languageCode: ttsLanguage, signal: abort.signal },
            {
              onAudio: (audio, contentType) => {
                emit({
                  type: "response.audio.delta",
                  audio: audio.toString("base64"),
                  contentType,
                });
              },
              onError: (error) => {
                ttsFailed = true;
                logger.error({ err: error }, "TTS failed");
                emit({ type: "error", code: "tts_failed", message: "Speech synthesis failed." });
              },
            },
          )
          .then((session) => {
            if (generation !== this.generation) {
              void session.close();
              return null;
            }
            return session;
          })
          .catch((error: unknown) => {
            ttsFailed = true;
            if (!abort.signal.aborted) {
              logger.error({ err: error }, "TTS failed");
              emit({ type: "error", code: "tts_failed", message: "Speech synthesis failed." });
            }
            return null;
          });

        let ttsStarted = false;
        const speak = async (sentence: string) => {
          if (ttsFailed || generation !== this.generation) return;
          playback.session ??= await ttsReady;
          if (!playback.session || generation !== this.generation) return;
          if (!ttsStarted) {
            ttsStarted = true;
            logger.info({ language: ttsLanguage }, "TTS started");
          }
          await playback.session.sendText(sentence);
          await playback.session.flush();
        };

        try {
          for await (const event of this.deps.agent.run(
            {
              conversationId,
              input: text,
              metadata: { source: "voice", ...(language ? { language } : {}) },
            },
            { signal: abort.signal },
          )) {
            if (generation !== this.generation) return;
            if (event.type === "status") {
              emit({ type: "agent.status", status: event.status });
              continue;
            }
            if (event.type === "tool.call") {
              emit({ type: "tool.call", name: event.name, arguments: event.arguments });
              continue;
            }
            if (event.type === "tool.result") {
              emit({ type: "tool.result", name: event.name, result: asJsonIfPossible(event.result) });
              continue;
            }
            if (event.type === "text.delta") {
              emit({ type: "response.text.delta", text: event.text });
              for (const sentence of buffer.push(event.text)) await speak(sentence);
              continue;
            }
            if (event.type === "error") {
              emit({ type: "error", code: event.code, message: event.message });
            }
          }
          const rest = buffer.flush();
          if (rest) await speak(rest);
          const activeTts = playback.session;
          if (activeTts && generation === this.generation) {
            await activeTts.close();
            logger.info("TTS completed");
          }
          if (generation === this.generation && !abort.signal.aborted) {
            emit({ type: "response.done" });
            logger.info("request completed");
          }
        } catch (error) {
          if (generation !== this.generation || abort.signal.aborted) return;
          this.fail(error);
        } finally {
          if (this.turnAbort === abort) this.turnAbort = null;
          if (!playback.session) {
            const session = await ttsReady.catch(() => null);
            await session?.close();
          }
        }
      },
    );
  }

  private cancelActiveTurn(): void {
    if (!this.turnAbort) return;
    this.generation += 1;
    this.turnAbort.abort();
    this.turnAbort = null;
    this.deps.logger.info({ sessionId: this.sessionId }, "cancelled active turn");
  }

  private fail(error: unknown): void {
    const code = error instanceof AppError ? error.code : "voice_error";
    const message = error instanceof Error ? error.message : "Voice session failed.";
    this.deps.logger.error({ err: error, code }, "voice session error");
    this.send({ type: "error", code, message });
  }

  private send(event: ServerEvent): void {
    if (this.closed || this.socket.readyState !== SOCKET_OPEN) return;
    this.socket.send(JSON.stringify(event));
  }
}

function toBuffer(data: Buffer | ArrayBuffer | Buffer[] | string): Buffer {
  if (typeof data === "string") return Buffer.from(data);
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
