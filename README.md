# Dost

Dost is a personal, voice-first assistant. This repository is the Node.js runtime.

HTTP and WebSocket are transports. Both call the same LangGraph agent. The agent calls Ollama and, when a tool is needed, an MCP server. Sarvam speech-to-text and text-to-speech stay behind provider interfaces. The mobile app is not part of this milestone.

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

Health:

```bash
curl http://127.0.0.1:3000/health
```

Text chat:

```bash
curl -s http://127.0.0.1:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"conversationId":"test","message":"What is 2 + 2?"}'
```

`OLLAMA_BASE_URL` can be `http://127.0.0.1:11434` or `http://<mac-ip>:11434`. `OLLAMA_MODEL` selects the local model. Use a model that supports tool calling, such as `llama3.1` or `qwen2.5`, when you want calendar, weather, or notes tools.

Ollama is only reached by this process. Do not expose Ollama, or Dost, to the public internet. There is no authentication yet.

## Voice

Set `SARVAM_API_KEY`, then open `http://127.0.0.1:3000/dev/voice` on this Mac. Microphone access needs localhost or HTTPS.

The browser sends PCM16 mono audio on `WS /ws/voice` and receives transcripts, text, and MP3 audio on the same socket. Speech language is detected automatically (`SARVAM_STT_LANGUAGE=auto`).

## MCP

Server definitions live in the file named by `MCP_CONFIG_PATH`. Disabled servers are ignored. Enabling another server does not change the LangGraph graph.

- Google Calendar: `@cocal/google-calendar-mcp` over stdio. Dost does not call the Google Calendar API itself.
- Notes and reminders: `examples/notes-mcp/server.ts`.
- Weather, or any later capability: any stdio or streamable-HTTP MCP server.

```bash
npm test
npm run typecheck
```

MongoDB is optional. Set `MEMORY_DRIVER=mongodb` and `MONGODB_URI` to persist conversations. The default `memory` driver keeps them in the process.
