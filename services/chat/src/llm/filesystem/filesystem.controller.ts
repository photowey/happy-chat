import { Controller, Post, Body } from '@nestjs/common';
import { FilesystemService } from './filesystem.service';

@Controller('api/files')
export class FilesystemController {
  constructor(private readonly filesystemService: FilesystemService) {}

  @Post('chat')
  async chat(@Body() body: { input: string }) {
    return this.filesystemService.chat(body.input);
  }
}
