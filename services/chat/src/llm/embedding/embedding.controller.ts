import { Controller, Post, Body } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';

@Controller('api/embedding')
export class EmbeddingController {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  @Post('embed')
  async embed(@Body() body: { text: string }) {
    const vector = await this.embeddingService.embedQuery(body.text);
    return { dimensions: vector.length, vector };
  }

  @Post('store')
  async store(@Body() body: { texts: string[] }) {
    return this.vectorStoreService.addTexts(body.texts);
  }

  @Post('search')
  async search(@Body() body: { query: string; k?: number }) {
    return this.vectorStoreService.search(body.query, body.k ?? 3);
  }
}
