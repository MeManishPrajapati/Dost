import * as Haptics from "expo-haptics";
import type { Capability } from "./types";

export class HapticsCapability implements Capability {
  name = "haptics";

  supportedCommands(): string[] {
    return ["haptics.light", "haptics.medium", "haptics.heavy", "haptics.success", "haptics.warning", "haptics.error"];
  }

  async handle(command: string): Promise<Record<string, unknown>> {
    switch (command) {
      case "haptics.light":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return { haptics: "light" };

      case "haptics.medium":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return { haptics: "medium" };

      case "haptics.heavy":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return { haptics: "heavy" };

      case "haptics.success":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return { haptics: "success" };

      case "haptics.warning":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return { haptics: "warning" };

      case "haptics.error":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return { haptics: "error" };

      default:
        throw new Error(`Unknown haptics command: ${command}`);
    }
  }
}
