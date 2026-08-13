import { Injectable } from '@nestjs/common';
import { ProviderType, ProviderVerificationDocument, VerificationStatus } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { VerificationDocumentRepository } from '../infrastructure/verification-document.repository';

export interface ListVerificationDocumentsInput {
  providerType?: ProviderType;
  providerId?: string;
  status?: VerificationStatus;
  cursor?: string;
  limit?: number;
}

export interface ListVerificationDocumentsResult {
  items: ProviderVerificationDocument[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface DocumentCursor {
  c: string;
  i: string;
}

/** Admin review queue (File 11 07.3). */
@Injectable()
export class ListVerificationDocumentsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: VerificationDocumentRepository,
  ) {}

  async execute(input: ListVerificationDocumentsInput): Promise<ListVerificationDocumentsResult> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<DocumentCursor>(input.cursor);

    const rows = await this.documents.list(this.prisma, {
      providerType: input.providerType,
      providerId: input.providerId,
      status: input.status,
      cursor: cursor ? { createdAt: cursor.c, id: cursor.i } : undefined,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor<DocumentCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
    };
  }
}
