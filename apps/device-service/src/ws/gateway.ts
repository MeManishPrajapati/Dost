import type { FastifyInstance } from "fastify";
import {
  MessageType,
  clientMessageSchema,
  type RegisteredMessage,
  type ErrorMessage,
} from "@dost/device-protocol";
import type { DeviceRegistry } from "../device/registry.js";
import type { DeviceCommandRouter } from "../command/router.js";
import type { AppLogger } from "../server/logger.js";

export function registerDeviceGateway(
  app: FastifyInstance,
  registry: DeviceRegistry,
  router: DeviceCommandRouter,
  logger: AppLogger,
): void {
  app.get("/device", { websocket: true }, (socket, _req) => {
    let deviceId: string | null = null;

    socket.on("message", (raw: Buffer | string) => {
      let data: unknown;
      try {
        data = JSON.parse(String(raw));
      } catch {
        sendError(socket, "Invalid JSON");
        return;
      }

      const parsed = clientMessageSchema.safeParse(data);
      if (!parsed.success) {
        sendError(socket, `Invalid message: ${parsed.error.issues[0]?.message ?? "unknown"}`);
        return;
      }

      const msg = parsed.data;

      switch (msg.type) {
        case MessageType.REGISTER: {
          deviceId = msg.deviceId;
          registry.register(
            {
              id: msg.deviceId,
              name: msg.name,
              type: msg.deviceType,
              platform: msg.platform,
              capabilities: msg.capabilities,
            },
            socket,
          );

          const ack: RegisteredMessage = {
            type: MessageType.REGISTERED,
            deviceId: msg.deviceId,
            status: "connected",
          };
          socket.send(JSON.stringify(ack));
          logger.info({ deviceId: msg.deviceId, capabilities: msg.capabilities }, "device registered");
          break;
        }

        case MessageType.COMMAND_RESULT: {
          router.handleResult(msg);
          break;
        }

        case MessageType.HEARTBEAT: {
          registry.touch(msg.deviceId);
          break;
        }
      }
    });

    socket.on("close", () => {
      if (deviceId) {
        registry.unregister(deviceId);
        logger.info({ deviceId }, "device disconnected");
      }
    });

    socket.on("error", (err: Error) => {
      logger.error({ deviceId, err: err.message }, "device socket error");
    });
  });
}

function sendError(socket: { send: (data: string) => void }, message: string): void {
  const err: ErrorMessage = { type: MessageType.ERROR, message };
  socket.send(JSON.stringify(err));
}
