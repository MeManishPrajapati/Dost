import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requestContext, updateRequestStore } from "../../server/context.js";
import type { AppLogger } from "../../server/logger.js";
import { AppError } from "../../shared/errors.js";
import { validateImage } from "../../vision/image.js";
import type { VisionService } from "../../vision/service.js";

const querySchema = z.string().trim().min(1).max(2_000);

export function registerVisionRoute(
  app: FastifyInstance,
  deps: { vision: VisionService; logger: AppLogger; maxImageBytes: number },
): void {
  void app.register(async (scope) => {
    await scope.register(multipart, {
      limits: { fileSize: deps.maxImageBytes, files: 1 },
    });

    scope.post("/api/vision/query", async (request, reply) => {
      if (!request.isMultipart()) {
        throw new AppError("validation_error", "Expected multipart/form-data", 400);
      }

      let imageBuffer: Buffer | undefined;
      let imageMimeType = "";
      let queryRaw = "";

      for await (const part of request.parts()) {
        if (part.type === "file" && part.fieldname === "image") {
          imageMimeType = part.mimetype;
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          imageBuffer = Buffer.concat(chunks);
          if (part.file.truncated) {
            throw new AppError(
              "payload_too_large",
              `Image exceeds ${(deps.maxImageBytes / 1_048_576).toFixed(1)} MB limit`,
              413,
            );
          }
        } else if (part.type === "field" && part.fieldname === "query") {
          queryRaw = String(part.value ?? "");
        }
      }

      if (!imageBuffer) {
        throw new AppError("validation_error", "Missing image field", 400);
      }

      const validation = validateImage(imageBuffer, imageMimeType, {
        maxBytes: deps.maxImageBytes,
      });
      if (!validation.valid) {
        throw new AppError("validation_error", validation.reason, 400);
      }

      let query: string;
      try {
        query = querySchema.parse(queryRaw);
      } catch {
        throw new AppError("validation_error", "Query must be 1–2000 characters", 400);
      }

      const requestId =
        typeof request.id === "string" ? request.id : String(request.id);

      return requestContext.run(
        { requestId, conversationId: "vision" },
        async () => {
          updateRequestStore({ conversationId: "vision" });
          deps.logger.info("vision request received");

          try {
            const result = await deps.vision.analyze({
              image: imageBuffer,
              mimeType: imageMimeType,
              prompt: query,
            });

            deps.logger.info("vision request completed");
            return reply.send({
              answer: result.text,
              model: result.model,
              provider: result.provider,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Vision analysis failed";
            throw new AppError("vision_error", message, 502);
          }
        },
      );
    });
  });
}
