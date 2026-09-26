import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { z } from "zod";
import { requestContext, updateRequestStore } from "../../server/context.js";
import type { AppLogger } from "../../server/logger.js";
import { AppError } from "../../shared/errors.js";
import type { AgentRunner } from "../../shared/types.js";

const chatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(8_000),
});

export function registerChatRoute(
  app: FastifyInstance,
  deps: { agent: AgentRunner; logger: AppLogger },
): void {
  app.post("/api/chat", async (request, reply) => {
    let body: z.infer<typeof chatRequestSchema>;
    try {
      body = chatRequestSchema.parse(request.body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError(
          "validation_error",
          error.issues.map((issue) => issue.message).join("; "),
          400,
        );
      }
      throw error;
    }

    const abort = new AbortController();
    let finished = false;
    reply.raw.on("close", () => {
      if (!finished) abort.abort();
    });

    try {
      return await requestContext.run(
        { requestId: request.id, conversationId: body.conversationId },
        async () => {
          updateRequestStore({ conversationId: body.conversationId });
          deps.logger.info("request received");
          let text = "";
          for await (const event of deps.agent.run(
            {
              conversationId: body.conversationId,
              input: body.message,
              metadata: { source: "text" },
            },
            { signal: abort.signal },
          )) {
            if (event.type === "text.delta") text += event.text;
            if (event.type === "error") {
              const status = event.code === "agent_timeout" ? 504 : event.code === "llm_unavailable" ? 503 : 502;
              throw new AppError(event.code, event.message, status);
            }
            if (event.type === "done") {
              if (event.cancelled) throw new AppError("cancelled", "Request cancelled", 499);
              text = event.text || text;
            }
          }
          deps.logger.info("request completed");
          return { conversationId: body.conversationId, message: text };
        },
      );
    } finally {
      finished = true;
    }
  });
}
