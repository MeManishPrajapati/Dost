export interface Transcript {
  text: string;
  language?: string;
}

export interface STTCallbacks {
  onPartial: (transcript: Transcript) => void;
  onFinal: (transcript: Transcript) => void;
  onSpeechStart?: () => void;
  onError: (error: Error) => void;
}

export interface STTSessionOptions {
  sampleRate: number;
  signal?: AbortSignal;
}

export interface STTSession {
  sendAudio(chunk: Buffer): void;
  beginUtterance(): void;
  endUtterance(): void;
  close(): Promise<void>;
}

export interface STTProvider {
  startSession(options: STTSessionOptions, callbacks: STTCallbacks): Promise<STTSession>;
}
