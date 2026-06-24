import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { RunnableMemoryService } from './runnable-memory.service';

@Controller('api/memory')
export class MemoryController {
  constructor(private readonly memoryService: RunnableMemoryService) {}

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
}
