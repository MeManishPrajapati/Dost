import type { Capability } from "./types";

export class TorchCapability implements Capability {
  name = "torch";
  private isOn = false;

  supportedCommands(): string[] {
    return ["torch.on", "torch.off"];
  }

  async handle(command: string): Promise<Record<string, unknown>> {
    switch (command) {
      case "torch.on":
        this.isOn = true;
        return { torch: "on", note: "Requires development build for real torch control" };

      case "torch.off":
        this.isOn = false;
        return { torch: "off", note: "Requires development build for real torch control" };

      default:
        throw new Error(`Unknown torch command: ${command}`);
    }
  }
}
