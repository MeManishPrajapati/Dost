import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { Env } from "../config/env.js";
import type { AppLogger } from "./logger.js";
import type { AgentRunner } from "../shared/types.js";
import type { STTProvider } from "../voice/stt/provider.js";
import type { TTSProvider } from "../voice/tts/provider.js";
import { VoiceSession } from "../transport/websocket/voice-session.js";

export async function registerVoiceSocket(
  app: FastifyInstance,
  deps: {
    env: Env;
    logger: AppLogger;
    agent: AgentRunner;
    stt: STTProvider;
    tts: TTSProvider;
  },
): Promise<void> {
  await app.register(websocket, {
    options: { maxPayload: 8 * 1024 * 1024 },
  });

  app.get("/ws/voice", { websocket: true }, (socket, request) => {
    const session = new VoiceSession(socket, deps);
    request.log.info("voice socket connected");
    socket.on("message", (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      void session.handleMessage(data, isBinary).catch((error: unknown) => {
        request.log.error({ err: error }, "voice socket message failed");
      });
    });
    socket.on("close", () => {
      void session.close();
      request.log.info("voice socket closed");
    });
    socket.on("error", (error: Error) => {
      request.log.error({ err: error }, "voice socket error");
    });
  });
}
