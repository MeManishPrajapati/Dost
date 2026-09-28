export interface VisionInput {
  image: Buffer;
  mimeType: string;
  prompt: string;
}

export interface VisionResponse {
  text: string;
  provider?: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface VisionModelProvider {
  analyze(input: VisionInput): Promise<VisionResponse>;
}
