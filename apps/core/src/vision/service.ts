import type { VisionInput, VisionModelProvider, VisionResponse } from "./provider.js";

export class VisionService {
  constructor(private readonly provider: VisionModelProvider) {}

  async analyze(input: VisionInput): Promise<VisionResponse> {
    return this.provider.analyze(input);
  }
}
