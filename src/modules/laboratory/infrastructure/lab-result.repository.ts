import { Injectable } from '@nestjs/common';
import { LabResultDocument, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface NewLabResultDocument {
  labOrderId: string;
  itemId: string;
  fileLabel: string;
  sizeKb: number;
  uploadedBy: string;
}

@Injectable()
export class LabResultRepository {
  create(db: Prisma.TransactionClient, input: NewLabResultDocument): Promise<LabResultDocument> {
    return db.labResultDocument.create({
      data: {
        lab_order_id: input.labOrderId,
        item_id: input.itemId,
        file_label: input.fileLabel,
        size_kb: input.sizeKb,
        uploaded_by: input.uploadedBy,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<LabResultDocument | null> {
    return db.labResultDocument.findUnique({ where: { id } });
  }

  findByOrderId(db: Prisma.TransactionClient, labOrderId: string): Promise<LabResultDocument[]> {
    return db.labResultDocument.findMany({ where: { lab_order_id: labOrderId } });
  }

  /** One-shot per result — the caller (`SetCriticalFlagUseCase`) already 409s a second call via `review_state`, matching `optimistic-lock`'s conflict shape. */
  async setCriticalCall(db: Prisma.TransactionClient, id: string, currentVersion: number, isCritical: boolean): Promise<void> {
    await updateWithOptimisticLock(db.labResultDocument, id, currentVersion, { is_critical: isCritical, review_state: 'REVIEWED' });
  }

  /** Deletes every result document on the order — mirrors the mock's `rejectSample` (`row.results = []`); a rejected sample invalidates every prior result. */
  deleteByOrderId(db: Prisma.TransactionClient, labOrderId: string): Promise<Prisma.BatchPayload> {
    return db.labResultDocument.deleteMany({ where: { lab_order_id: labOrderId } });
  }
}
