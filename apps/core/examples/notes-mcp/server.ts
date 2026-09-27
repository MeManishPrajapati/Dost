import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

interface Note {
  text: string;
  due?: string;
  createdAt: string;
}

function notesFile(): string {
  return process.env.NOTES_PATH || path.resolve("data/notes.json");
}

function readNotes(): Note[] {
  const file = notesFile();
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
  return Array.isArray(parsed) ? (parsed as Note[]) : [];
}

function writeNotes(notes: Note[]): void {
  const file = notesFile();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(notes, null, 2));
}

const server = new McpServer({ name: "dost-notes", version: "0.1.0" });

server.registerTool(
  "create_note",
  {
    description: "Save a personal note or reminder.",
    inputSchema: {
      text: z.string().min(1).describe("The note or reminder text"),
      due: z.string().optional().describe("Optional due time, as natural language or ISO-8601"),
    },
  },
  async ({ text, due }) => {
    const notes = readNotes();
    const note: Note = { text, createdAt: new Date().toISOString(), ...(due ? { due } : {}) };
    notes.push(note);
    writeNotes(notes);
    return { content: [{ type: "text" as const, text: `Saved note: ${text}` }] };
  },
);

server.registerTool(
  "list_notes",
  {
    description: "List the user's saved notes and reminders.",
    inputSchema: {},
  },
  async () => {
    const notes = readNotes();
    const text = notes.length === 0 ? "No notes saved." : JSON.stringify(notes);
    return { content: [{ type: "text" as const, text }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
