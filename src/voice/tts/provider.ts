export interface TTSCallbacks {
  onAudio: (audio: Buffer, contentType: string) => void;
  onError: (error: Error) => void;
}

export interface TTSSessionOptions {
  languageCode: string;
  signal?: AbortSignal;
}

export interface TTSSession {
  sendText(text: string): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface TTSProvider {
  startSession(options: TTSSessionOptions, callbacks: TTSCallbacks): Promise<TTSSession>;
}
