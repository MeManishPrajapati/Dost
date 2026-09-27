import type { Capability } from "../capabilities/types";

export interface CommandLogEntry {
  id: number;
  timestamp: string;
  command: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

type LogListener = (entry: CommandLogEntry) => void;

let nextId = 1;

export class DeviceCommandHandler {
  private capabilities: Capability[];
  private logListeners = new Set<LogListener>();

  constructor(capabilities: Capability[]) {
    this.capabilities = capabilities;
  }

  onLog(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private emitLog(entry: CommandLogEntry): void {
    for (const listener of this.logListeners) {
      listener(entry);
    }
  }

  async handle(
    command: string,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
    const capName = command.split(".")[0]!;
    const cap = this.capabilities.find((c) => c.name === capName);
    if (!cap) {
      const entry: CommandLogEntry = {
        id: nextId++,
        timestamp: new Date().toLocaleTimeString(),
        command,
        success: false,
        error: `Unsupported capability: ${capName}`,
      };
      this.emitLog(entry);
      return { success: false, error: entry.error };
    }
    try {
      const result = await cap.handle(command, args);
      const entry: CommandLogEntry = {
        id: nextId++,
        timestamp: new Date().toLocaleTimeString(),
        command,
        success: true,
        result,
      };
      this.emitLog(entry);
      return { success: true, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const entry: CommandLogEntry = {
        id: nextId++,
        timestamp: new Date().toLocaleTimeString(),
        command,
        success: false,
        error,
      };
      this.emitLog(entry);
      return { success: false, error };
    }
  }

  listCapabilities(): string[] {
    return this.capabilities.map((c) => c.name);
  }
}
