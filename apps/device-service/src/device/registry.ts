import type { WebSocket } from "ws";
import type { DeviceInfo } from "@dost/device-protocol";

export class DeviceRegistry {
  private devices = new Map<string, DeviceInfo>();
  private sockets = new Map<string, WebSocket>();

  register(info: Omit<DeviceInfo, "connected" | "connectedAt" | "lastSeenAt">, ws: WebSocket): DeviceInfo {
    const now = new Date().toISOString();
    const device: DeviceInfo = {
      ...info,
      connected: true,
      connectedAt: now,
      lastSeenAt: now,
    };
    this.devices.set(info.id, device);
    this.sockets.set(info.id, ws);
    return device;
  }

  unregister(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.connected = false;
    }
    this.sockets.delete(deviceId);
  }

  get(deviceId: string): DeviceInfo | undefined {
    return this.devices.get(deviceId);
  }

  getSocket(deviceId: string): WebSocket | undefined {
    return this.sockets.get(deviceId);
  }

  getAll(): DeviceInfo[] {
    return [...this.devices.values()];
  }

  getConnected(): DeviceInfo[] {
    return [...this.devices.values()].filter((d) => d.connected);
  }

  getCapabilities(deviceId: string): string[] {
    return this.devices.get(deviceId)?.capabilities ?? [];
  }

  touch(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeenAt = new Date().toISOString();
    }
  }
}
