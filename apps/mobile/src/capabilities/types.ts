export interface Capability {
  name: string;
  handle(command: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  supportedCommands(): string[];
}
