import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { Env } from "../config/env.js";
import type { AppLogger } from "./logger.js";
import type { DeviceRegistry } from "../device/registry.js";
import type { DeviceCommandRouter } from "../command/router.js";
import { registerDeviceGateway } from "../ws/gateway.js";
import { z } from "zod";

const devCommandBody = z.object({
  command: z.string().min(1),
  arguments: z.record(z.unknown()).optional(),
});

export async function createHttpServer(opts: {
  env: Env;
  logger: AppLogger;
  registry: DeviceRegistry;
  router: DeviceCommandRouter;
}) {
  const { env, logger, registry, router } = opts;

  const app = Fastify({ logger: false });
  await app.register(websocket);

  app.get("/health", async () => ({
    status: "ok",
    service: "dost-device-service",
    connectedDevices: registry.getConnected().length,
  }));

  registerDeviceGateway(app, registry, router, logger);

  if (env.nodeEnv !== "production") {
    app.post<{ Params: { deviceId: string } }>(
      "/dev/devices/:deviceId/commands",
      async (request, reply) => {
        const parsed = devCommandBody.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: parsed.error.issues });
        }
        const result = await router.routeCommand({
          deviceId: request.params.deviceId,
          command: parsed.data.command,
          arguments: parsed.data.arguments,
        });
        return reply.send(result);
      },
    );
    logger.info("dev command endpoint registered at POST /dev/devices/:deviceId/commands");
  }

  return app;
}
