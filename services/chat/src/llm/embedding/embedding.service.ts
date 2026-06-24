import { Injectable } from '@nestjs/common';
import { Embeddings } from '@langchain/core/embeddings';

@Injectable()
export class EmbeddingService extends Embeddings {
  private embedder: any = null;
  private readonly modelName = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

  constructor() {
    super({});
  }

  private async getEmbedder() {
    if (!this.embedder) {
      const { pipeline } = await import('@xenova/transformers');
      this.embedder = await pipeline('feature-extraction', this.modelName);
    }
    return this.embedder;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const embedder = await this.getEmbedder();
    const cleanTexts = texts.map((t) => t.replace(/\n/g, ' '));
    const output = await embedder(cleanTexts, { pooling: 'mean', normalize: true });
    return Array.from(output.tolist()) as number[][];
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embedDocuments([text]);
    return vector;
  }
}
