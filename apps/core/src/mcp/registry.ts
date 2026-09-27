export interface ToolDefinition {
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(args: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly closers: Array<() => Promise<void>> = [];

  add(tool: ToolDefinition): string {
    const base = sanitizeToolName(tool.name);
    let name = base;
    if (this.tools.has(name)) name = sanitizeToolName(`${tool.serverId}_${tool.name}`);
    let suffix = 2;
    while (this.tools.has(name)) {
      name = sanitizeToolName(`${tool.serverId}_${tool.name}_${suffix}`);
      suffix += 1;
    }
    this.tools.set(name, { ...tool, name });
    return name;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.call(args, signal);
  }

  addCloser(closer: () => Promise<void>): void {
    this.closers.push(closer);
  }

  async close(): Promise<void> {
    const closers = this.closers.splice(0);
    for (const closer of closers) {
      await closer();
    }
  }
}

export function sanitizeToolName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^[^A-Za-z]+/, "");
  return cleaned.slice(0, 64) || "tool";
}
