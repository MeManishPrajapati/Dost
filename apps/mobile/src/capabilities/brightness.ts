import * as Brightness from "expo-brightness";
import type { Capability } from "./types";

export class BrightnessCapability implements Capability {
  name = "brightness";

  supportedCommands(): string[] {
    return ["brightness.set", "brightness.get", "brightness.max", "brightness.dim"];
  }

  async handle(command: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (command) {
      case "brightness.get": {
        const level = await Brightness.getBrightnessAsync();
        return { brightness: Math.round(level * 100) };
      }

      case "brightness.set": {
        const value = typeof args.level === "number" ? args.level : 50;
        const clamped = Math.min(100, Math.max(0, value)) / 100;
        await Brightness.setBrightnessAsync(clamped);
        return { brightness: Math.round(clamped * 100) };
      }

      case "brightness.max":
        await Brightness.setBrightnessAsync(1);
        return { brightness: 100 };

      case "brightness.dim":
        await Brightness.setBrightnessAsync(0.1);
        return { brightness: 10 };

      default:
        throw new Error(`Unknown brightness command: ${command}`);
    }
  }
}
