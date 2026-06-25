import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

const ALLOWED_MIMES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Controller('api/documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined,
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          cb(
            new BadRequestException(`File type ${file.mimetype} not allowed`),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async upload(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentService.upload(userId, file);
  }

  @Post(':id/process')
  async process(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.documentService.findById(id, userId);
    await this.documentService.markProcessing(id);
    return { accepted: true, documentId: id, status: 'processing' };
  }

  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    return this.documentService.findByUser(userId);
  }

  @Get(':id')
  async findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.documentService.findById(id, userId);
  }

  @Delete(':id')
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.documentService.delete(id, userId);
    return { deleted: true };
  }
}
