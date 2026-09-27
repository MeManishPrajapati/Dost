import { z } from "zod";
import type { DeviceRegistry } from "../device/registry.js";
import type { DeviceCommandRouter } from "../command/router.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerDeviceTools(
  mcp: McpServer,
  registry: DeviceRegistry,
  router: DeviceCommandRouter,
): void {
  mcp.registerTool(
    "device_list",
    {
      description: "List all connected devices and their capabilities.",
      inputSchema: {},
    },
    async () => {
      const devices = registry.getConnected();
      const text =
        devices.length === 0
          ? "No devices connected."
          : JSON.stringify(
              devices.map((d) => ({
                deviceId: d.id,
                name: d.name,
                type: d.type,
                platform: d.platform,
                capabilities: d.capabilities,
              })),
            );
      return { content: [{ type: "text" as const, text }] };
    },
  );

  mcp.registerTool(
    "phone_torch_on",
    {
      description: "Turn on the torch/flashlight on a connected mobile device.",
      inputSchema: { deviceId: z.string().uuid().describe("The device ID to target") },
    },
    async ({ deviceId }) => {
      const res = await router.routeCommand({ deviceId, command: "torch.on" });
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    },
  );

  mcp.registerTool(
    "phone_torch_off",
    {
      description: "Turn off the torch/flashlight on a connected mobile device.",
      inputSchema: { deviceId: z.string().uuid().describe("The device ID to target") },
    },
    async ({ deviceId }) => {
      const res = await router.routeCommand({ deviceId, command: "torch.off" });
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    },
  );

  mcp.registerTool(
    "phone_battery_status",
    {
      description: "Get the battery level and charging status of a connected mobile device.",
      inputSchema: { deviceId: z.string().uuid().describe("The device ID to target") },
    },
    async ({ deviceId }) => {
      const res = await router.routeCommand({ deviceId, command: "battery.status" });
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    },
  );

  mcp.registerTool(
    "phone_vibrate",
    {
      description: "Make a connected mobile device vibrate. Use this to get the user's attention.",
      inputSchema: {
        deviceId: z.string().uuid().describe("The device ID to target"),
        intensity: z.enum(["short", "long"]).default("short").describe("Vibration intensity: short (200ms) or long (1s)"),
      },
    },
    async ({ deviceId, intensity }) => {
      const command = intensity === "long" ? "vibrate.long" : "vibrate.short";
      const res = await router.routeCommand({ deviceId, command });
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    },
  );

  mcp.registerTool(
    "phone_brightness",
    {
      description: "Set or get the screen brightness on a connected mobile device.",
      inputSchema: {
        deviceId: z.string().uuid().describe("The device ID to target"),
        action: z.enum(["get", "set", "max", "dim"]).describe("What to do: get current level, set to specific value, max, or dim"),
        level: z.number().min(0).max(100).optional().describe("Brightness level 0-100 (only used with 'set' action)"),
      },
    },
    async ({ deviceId, action, level }) => {
      const command = `brightness.${action}`;
      const args = action === "set" && level !== undefined ? { level } : {};
      const res = await router.routeCommand({ deviceId, command, arguments: args });
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    },
  );

  mcp.registerTool(
    "phone_haptics",
    {
      description: "Trigger haptic feedback on a connected mobile device.",
      inputSchema: {
        deviceId: z.string().uuid().describe("The device ID to target"),
        type: z.enum(["light", "medium", "heavy", "success", "warning", "error"]).default("medium").describe("Type of haptic feedback"),
      },
    },
    async ({ deviceId, type }) => {
      const res = await router.routeCommand({ deviceId, command: `haptics.${type}` });
      return { content: [{ type: "text" as const, text: JSON.stringify(res) }] };
    },
  );
}
