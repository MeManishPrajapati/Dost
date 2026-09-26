#!/usr/bin/env bash
set -euo pipefail

if ! command -v ollama &>/dev/null; then
  echo "Ollama is not installed."
  echo ""
  echo "Install it from https://ollama.com/download"
  echo ""
  echo "  macOS:   brew install ollama"
  echo "  Linux:   curl -fsSL https://ollama.com/install.sh | sh"
  echo ""
  echo "After installing, start it with:  ollama serve"
  exit 1
fi

echo "Ollama found: $(command -v ollama)"
echo ""

if ! ollama list &>/dev/null; then
  echo "Ollama is installed but the service is not running."
  echo "Start it with:  ollama serve"
  exit 1
fi

echo "Available models:"
echo ""
ollama list
echo ""

RECOMMENDED="qwen3.5:9b gemma4:e4b"
echo "Recommended models for tool calling: $RECOMMENDED"
echo ""
echo "Pull a model:  ollama pull qwen3.5:9b"
