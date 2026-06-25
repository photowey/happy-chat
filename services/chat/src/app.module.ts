import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from '@chat/app.controller';
import { AppService } from '@chat/app.service';
import { PrismaModule } from '@chat/prisma/prisma.module';
import { LlmModule } from '@chat/llm/llm.module';
import { MemoryModule } from '@chat/llm/memory/memory.module';
import { FilesystemModule } from '@chat/llm/filesystem/filesystem.module';
import { EmbeddingModule } from '@chat/llm/embedding/embedding.module';
import { AgentsModule } from '@chat/llm/agents/agents.module';
import { AdvancedModule } from '@chat/llm/advanced.module';
import { ConversationModule } from '@chat/conversation/conversation.module';
import { MessageModule } from '@chat/message/message.module';
import { DocumentModule } from '@chat/document/document.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LlmModule,
    MemoryModule,
    FilesystemModule,
    EmbeddingModule,
    AgentsModule,
    AdvancedModule,
    MessageModule,
    ConversationModule,
    DocumentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
