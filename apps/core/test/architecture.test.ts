import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readTree(dir: string): string {
  const entries = readdirSync(dir);
  return entries
    .map((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return readTree(full);
      return readFileSync(full, "utf8");
    })
    .join("\n");
}

describe("architecture boundaries", () => {
  it("keeps LangGraph unaware of transports and voice providers", () => {
    const agent = readTree("src/agent");
    expect(agent).not.toMatch(/sarvam|fastify|websocket|ollama/i);
    expect(agent).not.toMatch(/from ["'][^"']*\/(voice|transport|server)\//);
  });

  it("keeps MCP and voice providers unaware of LangGraph", () => {
    expect(readTree("src/mcp")).not.toMatch(/@langchain|langgraph|sarvam|fastify/);
    expect(readTree("src/voice")).not.toMatch(/langgraph|ollama|fastify/);
    expect(readFileSync("src/transport/http/chat.ts", "utf8")).not.toMatch(/ollama|langgraph|sarvam|mongodb/i);
  });

  it("does not call Google Calendar from inside the agent", () => {
    expect(readTree("src")).not.toMatch(/googleapis|google-calendar|calendar\.google/);
  });
});
