import { Platform } from "react-native";
import {
  MessageType,
  type CommandMessage,
  type RegisteredMessage,
  type ErrorMessage,
  type RegisterMessage,
  type CommandResultMessage,
} from "@dost/device-protocol";
import {
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_MAX_ATTEMPTS,
  HEARTBEAT_INTERVAL_MS,
} from "../config";
import type { DeviceCommandHandler } from "../command/handler";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export type StatusListener = (status: ConnectionStatus) => void;

export class DeviceConnectionService {
  private ws: WebSocket | null = null;
  private deviceId: string;
  private deviceName: string;
  private handler: DeviceCommandHandler;
  private serverUrl: string;
  private status: ConnectionStatus = "disconnected";
  private listeners: Set<StatusListener> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = false;

  constructor(opts: {
    deviceId: string;
    deviceName: string;
    handler: DeviceCommandHandler;
    serverUrl: string;
  }) {
    this.deviceId = opts.deviceId;
    this.deviceName = opts.deviceName;
    this.handler = opts.handler;
    this.serverUrl = opts.serverUrl;
  }

  setServerUrl(url: string): void {
    this.serverUrl = url;
  }

  onStatusChange(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    if (this.ws && (this.status === "connected" || this.status === "connecting")) return;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  private doConnect(): void {
    this.setStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.register();
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(String(event.data));
    };

    this.ws.onclose = () => {
      this.clearTimers();
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      } else {
        this.setStatus("disconnected");
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, which handles reconnect
    };
  }

  private register(): void {
    const msg: RegisterMessage = {
      type: MessageType.REGISTER,
      deviceId: this.deviceId,
      name: this.deviceName,
      deviceType: "mobile",
      platform: Platform.OS as "android" | "ios",
      capabilities: this.handler.listCapabilities(),
    };
    this.send(msg);
  }

  private handleMessage(raw: string): void {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const msg = data as { type: string };

    switch (msg.type) {
      case MessageType.REGISTERED: {
        const registered = data as RegisteredMessage;
        if (registered.status === "connected") {
          this.setStatus("connected");
        }
        break;
      }

      case MessageType.COMMAND: {
        const cmd = data as CommandMessage;
        void this.executeCommand(cmd);
        break;
      }

      case MessageType.ERROR: {
        const err = data as ErrorMessage;
        console.warn("[DeviceService] Server error:", err.message);
        break;
      }
    }
  }

  private async executeCommand(cmd: CommandMessage): Promise<void> {
    const result = await this.handler.handle(cmd.command, cmd.arguments);
    const response: CommandResultMessage = {
      type: MessageType.COMMAND_RESULT,
      requestId: cmd.requestId,
      success: result.success,
      result: result.result,
      error: result.error,
    };
    this.send(response);
  }

  private send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: MessageType.HEARTBEAT, deviceId: this.deviceId });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.setStatus("disconnected");
      this.shouldReconnect = false;
      return;
    }
    this.setStatus("reconnecting");
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
