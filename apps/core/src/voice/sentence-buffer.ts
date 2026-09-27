const SENTENCE_TERMINATORS = new Set([".", "!", "?", "।", "॥", "؟"]);
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "eg", "ie"]);

export interface SentenceBufferOptions {
  maxChars?: number;
}

/**
 * Turns a token stream into speakable chunks.
 * Independent of any TTS provider. Handles English, Hindi, Gujarati, and Hinglish punctuation.
 */
export class SentenceBuffer {
  private buffer = "";
  private readonly maxChars: number;

  constructor(options: SentenceBufferOptions = {}) {
    this.maxChars = options.maxChars ?? 280;
  }

  push(text: string): string[] {
    if (!text) return [];
    this.buffer += text;
    const chunks: string[] = [];
    let end = findSentenceEnd(this.buffer);
    while (end !== null) {
      this.take(chunks, end);
      end = findSentenceEnd(this.buffer);
    }
    while (this.buffer.length > this.maxChars) {
      const cut = overflowCut(this.buffer, this.maxChars);
      this.take(chunks, cut);
    }
    return chunks;
  }

  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest || null;
  }

  private take(chunks: string[], end: number): void {
    const raw = this.buffer.slice(0, end).trim();
    this.buffer = this.buffer.slice(end).trimStart();
    if (!raw) return;
    if (/^[.!?।॥؟]+$/u.test(raw) && chunks.length > 0) {
      const previous = chunks.at(-1);
      if (previous) chunks[chunks.length - 1] = previous + raw;
      return;
    }
    chunks.push(raw);
  }
}

function findSentenceEnd(buffer: string): number | null {
  for (let index = 0; index < buffer.length; index += 1) {
    const character = buffer[index];
    if (!character || !SENTENCE_TERMINATORS.has(character)) continue;
    if (character === ".") {
      if (isDecimalPoint(buffer, index)) continue;
      if (buffer[index + 1] === ".") continue;
      if (isAbbreviation(buffer, index)) continue;
      const next = buffer[index + 1];
      if (next !== undefined && !/\s/u.test(next)) continue;
    }
    return index + 1;
  }
  return null;
}

function isDecimalPoint(buffer: string, index: number): boolean {
  const previous = buffer[index - 1];
  const next = buffer[index + 1];
  return Boolean(previous && next && /\d/.test(previous) && /\d/.test(next));
}

function isAbbreviation(buffer: string, index: number): boolean {
  const word = wordBefore(buffer, index).toLowerCase();
  if (!word) return false;
  if (ABBREVIATIONS.has(word)) return true;
  if (/^[a-z]$/i.test(word)) return !startsNewSentence(buffer, index);
  return false;
}

function startsNewSentence(buffer: string, terminatorIndex: number): boolean {
  let index = terminatorIndex + 1;
  while (index < buffer.length && /\s/u.test(buffer[index] ?? "")) index += 1;
  const next = buffer[index];
  if (!next) return false;
  return /[A-Z\u0900-\u097F\u0A80-\u0AFF]/u.test(next);
}

function wordBefore(buffer: string, index: number): string {
  let start = index - 1;
  while (start >= 0 && /[A-Za-z]/u.test(buffer[start] ?? "")) start -= 1;
  return buffer.slice(start + 1, index);
}

function overflowCut(buffer: string, maxChars: number): number {
  const window = buffer.slice(0, maxChars);
  for (let index = window.length - 1; index >= 40; index -= 1) {
    const character = window[index];
    if (character && /[\s,;:،、]/u.test(character)) return index + 1;
  }
  return maxChars;
}
