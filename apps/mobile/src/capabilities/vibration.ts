import { Vibration } from "react-native";
import type { Capability } from "./types";

export class VibrationCapability implements Capability {
  name = "vibrate";

  supportedCommands(): string[] {
    return ["vibrate.short", "vibrate.long", "vibrate.pattern"];
  }

  async handle(command: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (command) {
      case "vibrate.short":
        Vibration.vibrate(200);
        return { vibrated: true, duration: 200 };

      case "vibrate.long":
        Vibration.vibrate(1000);
        return { vibrated: true, duration: 1000 };

      case "vibrate.pattern": {
        const pattern = Array.isArray(args.pattern) ? args.pattern as number[] : [0, 200, 100, 200];
        Vibration.vibrate(pattern);
        return { vibrated: true, pattern };
      }

      default:
        throw new Error(`Unknown vibrate command: ${command}`);
    }
  }
}
