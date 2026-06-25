import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { MessageModule } from '../message/message.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [
    MessageModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [ConversationController],
  providers: [ConversationService, JwtAuthGuard],
  exports: [ConversationService],
})
export class ConversationModule {}
