import { Module } from '@nestjs/common';
import { AppController } from '@chat/app.controller';
import { AppService } from '@chat/app.service';
import { LlmModule } from '@chat/llm/llm.module';
import { MemoryModule } from '@chat/llm/memory/memory.module';
import { FilesystemModule } from '@chat/llm/filesystem/filesystem.module';
import { EmbeddingModule } from '@chat/llm/embedding/embedding.module';
import { AgentsModule } from '@chat/llm/agents/agents.module';
import { AdvancedModule } from '@chat/llm/advanced.module';

@Module({
  imports: [
    LlmModule,
    MemoryModule,
    FilesystemModule,
    EmbeddingModule,
    AgentsModule,
    AdvancedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
