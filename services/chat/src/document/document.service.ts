import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import fs from 'node:fs';
import path from 'node:path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const ALLOWED_TYPES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_SIZE = 10 * 1024 * 1024;

@Injectable()
export class DocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(userId: string, file: Express.Multer.File, filename?: string) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} not allowed`);
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('File exceeds 10MB limit');
    }

    const dir = path.join(UPLOAD_ROOT, userId);
    fs.mkdirSync(dir, { recursive: true });
    const savedName = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(dir, savedName);
    fs.writeFileSync(filePath, file.buffer);

    return this.prisma.documents.create({
      data: {
        userId,
        filename: filename ?? file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        filePath: path.relative(process.cwd(), filePath),
        storageType: 'local',
        status: 'pending',
      },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.documents.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(documentId: string, userId: string) {
    const doc = await this.prisma.documents.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.userId !== userId) throw new ForbiddenException('Access denied');
    return doc;
  }

  async delete(documentId: string, userId: string) {
    const doc = await this.findById(documentId, userId);
    if (doc.filePath) {
      const full = path.join(process.cwd(), doc.filePath);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
    await this.prisma.documents.delete({ where: { id: documentId } });
  }

  async markProcessing(documentId: string) {
    return this.prisma.documents.update({
      where: { id: documentId },
      data: { status: 'processing' },
    });
  }

  async markDone(documentId: string, chunkCount: number) {
    return this.prisma.documents.update({
      where: { id: documentId },
      data: { status: 'done', chunkCount },
    });
  }

  async markError(documentId: string) {
    return this.prisma.documents.update({
      where: { id: documentId },
      data: { status: 'error' },
    });
  }
}
