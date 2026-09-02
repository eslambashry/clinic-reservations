import { Injectable } from '@nestjs/common';
import { LabOrderNote, Prisma } from '@prisma/client';

@Injectable()
export class LabOrderNoteRepository {
  create(db: Prisma.TransactionClient, labOrderId: string, authorId: string, body: string): Promise<LabOrderNote> {
    return db.labOrderNote.create({
      data: { lab_order_id: labOrderId, author_id: authorId, body },
    });
  }

  /** Append-only (File 12 Part 05's "never updated, only created" precedent, same as `PrescriptionReview`) — oldest first, matching the drawer's own reading order. */
  findByOrderId(db: Prisma.TransactionClient, labOrderId: string): Promise<LabOrderNote[]> {
    return db.labOrderNote.findMany({ where: { lab_order_id: labOrderId }, orderBy: { created_at: 'asc' } });
  }
}
