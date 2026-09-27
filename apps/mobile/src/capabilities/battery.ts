import * as Battery from "expo-battery";
import type { Capability } from "./types";

export class BatteryCapability implements Capability {
  name = "battery";

  supportedCommands(): string[] {
    return ["battery.status"];
  }

  async handle(command: string): Promise<Record<string, unknown>> {
    switch (command) {
      case "battery.status": {
        const level = await Battery.getBatteryLevelAsync();
        const state = await Battery.getBatteryStateAsync();
        return {
          level: Math.round(level * 100),
          charging: state === Battery.BatteryState.CHARGING,
        };
      }
      default:
        throw new Error(`Unknown battery command: ${command}`);
    }
  }
}
