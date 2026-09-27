import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { MessageType, commandMessageSchema, type CommandMessage, type CommandResultMessage } from "@dost/device-protocol";
import type { DeviceRegistry } from "../device/registry.js";
import type { AppLogger } from "../server/logger.js";

export interface CommandRequest {
  deviceId: string;
  command: string;
  arguments?: Record<string, unknown>;
}

export interface CommandResponse {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

interface PendingRequest {
  resolve: (value: CommandResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DeviceCommandRouter {
  private pending = new Map<string, PendingRequest>();

  constructor(
    private registry: DeviceRegistry,
    private timeoutMs: number,
    private logger: AppLogger,
  ) {}

  async routeCommand(req: CommandRequest): Promise<CommandResponse> {
    const device = this.registry.get(req.deviceId);
    if (!device || !device.connected) {
      return { success: false, error: `Device ${req.deviceId} is not connected` };
    }

    if (!device.capabilities.includes(req.command.split(".")[0]!)) {
      return { success: false, error: `Device ${req.deviceId} does not support capability "${req.command.split(".")[0]}"` };
    }

    const ws = this.registry.getSocket(req.deviceId);
    if (!ws || ws.readyState !== ws.OPEN) {
      return { success: false, error: `WebSocket for device ${req.deviceId} is not open` };
    }

    const requestId = randomUUID();
    const message: CommandMessage = {
      type: MessageType.COMMAND,
      requestId,
      command: req.command,
      arguments: req.arguments ?? {},
    };

    return new Promise<CommandResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ success: false, error: `Command timed out after ${this.timeoutMs}ms` });
      }, this.timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });
      ws.send(JSON.stringify(message));
      this.logger.debug({ requestId, deviceId: req.deviceId, command: req.command }, "command sent");
    });
  }

  handleResult(result: CommandResultMessage): void {
    const pending = this.pending.get(result.requestId);
    if (!pending) {
      this.logger.warn({ requestId: result.requestId }, "received result for unknown request");
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(result.requestId);
    pending.resolve({
      success: result.success,
      result: result.result,
      error: result.error,
    });
  }

  close(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({ success: false, error: "Service shutting down" });
    }
    this.pending.clear();
  }
}
