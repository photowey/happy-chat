import { Module } from '@nestjs/common';
import { AppController } from '@chat/app.controller';
import { AppService } from '@chat/app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
