import { Injectable } from '@nestjs/common';
import { Prisma, ProviderType, ProviderVerificationDocument, VerificationStatus } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface CreateVerificationDocumentInput {
  providerType: ProviderType;
  providerId: string;
  docType: string;
  fileUrl: string;
}

export interface ListVerificationDocumentsParams {
  providerType?: ProviderType;
  providerId?: string;
  status?: VerificationStatus;
  cursor?: { createdAt: string; id: string };
  limit: number;
}

@Injectable()
export class VerificationDocumentRepository {
  create(
    db: Prisma.TransactionClient,
    input: CreateVerificationDocumentInput,
  ): Promise<ProviderVerificationDocument> {
    return db.providerVerificationDocument.create({
      data: {
        provider_type: input.providerType,
        provider_id: input.providerId,
        doc_type: input.docType,
        file_url: input.fileUrl,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<ProviderVerificationDocument | null> {
    return db.providerVerificationDocument.findUnique({ where: { id } });
  }

  /** Cursor pagination on `(created_at, id)` — File 12 Part 32.16's shared cursor.util handles the opaque encoding. */
  async list(
    db: Prisma.TransactionClient,
    params: ListVerificationDocumentsParams,
  ): Promise<ProviderVerificationDocument[]> {
    return db.providerVerificationDocument.findMany({
      where: {
        ...(params.providerType && { provider_type: params.providerType }),
        ...(params.providerId && { provider_id: params.providerId }),
        ...(params.status && { status: params.status }),
        ...(params.cursor && {
          OR: [
            { created_at: { gt: new Date(params.cursor.createdAt) } },
            { created_at: new Date(params.cursor.createdAt), id: { gt: params.cursor.id } },
          ],
        }),
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: params.limit,
    });
  }

  async setDecision(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    status: 'APPROVED' | 'REJECTED',
    reviewedBy: string,
  ): Promise<void> {
    await updateWithOptimisticLock(db.providerVerificationDocument, id, currentVersion, {
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date(),
    });
  }
}
