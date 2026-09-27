import { z } from "zod";

export const MessageType = {
  REGISTER: "device.register",
  REGISTERED: "device.registered",
  HEARTBEAT: "device.heartbeat",
  COMMAND: "device.command",
  COMMAND_RESULT: "device.command.result",
  ERROR: "device.error",
  DISCONNECT: "device.disconnect",
} as const;

// ---------- Client -> Service ----------

export const registerMessageSchema = z.object({
  type: z.literal(MessageType.REGISTER),
  deviceId: z.string().uuid(),
  name: z.string().min(1),
  deviceType: z.enum(["mobile", "laptop", "raspberry-pi"]),
  platform: z.enum(["android", "ios", "linux", "macos", "windows"]),
  capabilities: z.array(z.string().min(1)),
});

export const commandResultMessageSchema = z.object({
  type: z.literal(MessageType.COMMAND_RESULT),
  requestId: z.string().uuid(),
  success: z.boolean(),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

export const heartbeatMessageSchema = z.object({
  type: z.literal(MessageType.HEARTBEAT),
  deviceId: z.string().uuid(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  registerMessageSchema,
  commandResultMessageSchema,
  heartbeatMessageSchema,
]);

// ---------- Service -> Client ----------

export const registeredMessageSchema = z.object({
  type: z.literal(MessageType.REGISTERED),
  deviceId: z.string(),
  status: z.enum(["connected", "rejected"]),
  message: z.string().optional(),
});

export const commandMessageSchema = z.object({
  type: z.literal(MessageType.COMMAND),
  requestId: z.string().uuid(),
  command: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
});

export const errorMessageSchema = z.object({
  type: z.literal(MessageType.ERROR),
  message: z.string(),
  code: z.string().optional(),
});

// ---------- Inferred types ----------

export type RegisterMessage = z.infer<typeof registerMessageSchema>;
export type CommandResultMessage = z.infer<typeof commandResultMessageSchema>;
export type HeartbeatMessage = z.infer<typeof heartbeatMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type RegisteredMessage = z.infer<typeof registeredMessageSchema>;
export type CommandMessage = z.infer<typeof commandMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;

export type ServerMessage = RegisteredMessage | CommandMessage | ErrorMessage;

// ---------- Device info ----------

export interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  platform: string;
  capabilities: string[];
  connected: boolean;
  connectedAt?: string;
  lastSeenAt?: string;
}
