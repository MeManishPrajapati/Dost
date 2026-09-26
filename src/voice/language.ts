const TTS_LANGUAGES = new Set([
  "bn-IN",
  "en-IN",
  "gu-IN",
  "hi-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "od-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
]);

const TTS_ALIASES: Record<string, string> = {
  "or-IN": "od-IN",
};

export function resolveTtsLanguage(detected: string | undefined, fallback: string): string {
  if (!detected) return fallback;
  const mapped = TTS_ALIASES[detected] ?? detected;
  return TTS_LANGUAGES.has(mapped) ? mapped : fallback;
}
