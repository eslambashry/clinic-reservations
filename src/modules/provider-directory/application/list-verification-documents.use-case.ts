import { Inject, Injectable } from '@nestjs/common';
import { ProviderType, ProviderVerificationDocument, VerificationStatus } from '@prisma/client';
import { MEDIA_CONSTANTS } from '../../../shared/config/constants';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { MEDIA_STORAGE, MediaStoragePort } from '../../../shared/kernel/storage/media-storage.port';
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
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VerificationDocumentRepository) private readonly documents: VerificationDocumentRepository,
    @Inject(MEDIA_STORAGE) private readonly mediaStorage: MediaStoragePort,
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
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    // Signed fresh on every read — see the identical note in `GetPrescriptionUseCase`; the stored `file_url` stays unsigned.
    const items = page.map((document) => ({
      ...document,
      file_url: this.mediaStorage.getSignedUrl(document.file_url, MEDIA_CONSTANTS.SIGNED_URL_TTL_SECONDS),
    }));

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor<DocumentCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
    };
  }
}
