import { Module } from '@nestjs/common';
import { AdvancedController } from './advanced.controller';
import { AdvancedAnalysisService } from './advanced-analysis.service';
import { MemoryModule } from './memory/memory.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { FilesystemModule } from './filesystem/filesystem.module';
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [MemoryModule, EmbeddingModule, FilesystemModule, AgentsModule],
  controllers: [AdvancedController],
  providers: [AdvancedAnalysisService],
  exports: [AdvancedAnalysisService],
})
export class AdvancedModule {}
