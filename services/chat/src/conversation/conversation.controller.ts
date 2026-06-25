import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { MessageService } from '../message/message.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MessageRole } from '@prisma/client';

@Controller('api/conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
  ) {}

  @Post()
  async create(@CurrentUser('id') userId: string, @Body() body: { title?: string }) {
    return this.conversationService.create(userId, body.title);
  }

  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    return this.conversationService.findByUser(userId);
  }

  @Get(':id/messages')
  async getMessages(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.conversationService.findById(id, userId);
    return this.messageService.getHistory(id);
  }

  @Post(':id/chat')
  async chat(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: { input: string },
  ) {
    await this.conversationService.findById(id, userId);
    await this.messageService.addMessage(id, MessageRole.USER, body.input);
    return { conversationId: id, input: body.input };
  }

  @Delete(':id')
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.conversationService.delete(id, userId);
    return { deleted: true };
  }
}
