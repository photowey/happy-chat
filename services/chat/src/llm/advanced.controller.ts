import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { AdvancedAnalysisService } from './advanced-analysis.service';
import { RunnableMemoryService } from './memory/runnable-memory.service';
import { EmbeddingService } from './embedding/embedding.service';
import { VectorStoreService } from './embedding/vector-store.service';
import { FilesystemService } from './filesystem/filesystem.service';
import { OrchestratorService } from './agents/orchestrator.service';

@Controller('api/advanced')
export class AdvancedController {
  constructor(
    private readonly analysisService: AdvancedAnalysisService,
    private readonly memoryService: RunnableMemoryService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly filesystemService: FilesystemService,
    private readonly orchestratorService: OrchestratorService,
  ) {}

  // --- Unified Analyze ---
  @Post('analyze')
  async analyze(@Body() body: { sessionId: string; input: string }) {
    return this.analysisService.analyze(body.sessionId, body.input);
  }

  // --- Memory ---
  @Post('chat')
  async chat(@Body() body: { sessionId: string; input: string }) {
    return this.memoryService.chat(body.sessionId, body.input);
  }

  @Get('history/:sessionId')
  async getHistory(@Param('sessionId') sessionId: string) {
    const messages = await this.memoryService.getHistory(sessionId);
    return {
      sessionId,
      messages: messages.map((m) => ({
        type: m.constructor.name,
        content: m.content,
      })),
    };
  }

  @Delete('history/:sessionId')
  async clearSession(@Param('sessionId') sessionId: string) {
    this.memoryService.clearSession(sessionId);
    return { cleared: true, sessionId };
  }

  // --- Embedding ---
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

  // --- Filesystem ---
  @Post('files/chat')
  async filesChat(@Body() body: { input: string }) {
    return this.filesystemService.chat(body.input);
  }

  // --- Orchestrator ---
  @Post('orchestrate')
  async orchestrate(@Body() body: { input: string }) {
    return this.orchestratorService.orchestrate(body.input);
  }
}
