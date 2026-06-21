import { Module } from '@nestjs/common';
import { AppController } from '@chat/app.controller';
import { AppService } from '@chat/app.service';
import { LlmModule } from '@chat/llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
