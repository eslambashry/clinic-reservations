import { Inject, Injectable } from '@nestjs/common';
import { Prescription } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';

export interface ListPrescriptionsInput {
  cursor?: string;
  limit?: number;
}

export interface ListPrescriptionsResult {
  items: Prescription[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface QueueCursor {
  c: string;
  i: string;
}

/**
 * File 12 Part 37.5 — pharmacy-staff review queue. Not named in File 11's
 * endpoint table; added because the review workflow needs some way to
 * discover prescriptions to review, same precedent as
 * `GET /provider-verification-documents` (File 12 Part 32). Unscoped by
 * branch (no routing mechanism exists until Phase 7) — every `QUALITY_CHECK_PASSED`
 * prescription is visible to every `PHARMACY_STAFF` caller.
 */
@Injectable()
export class ListPrescriptionsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
  ) {}

  async execute(input: ListPrescriptionsInput): Promise<ListPrescriptionsResult> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<QueueCursor>(input.cursor);

    const rows = await this.prescriptions.listQualityCheckPassed(this.prisma, {
      cursor: cursor ? { createdAt: cursor.c, id: cursor.i } : undefined,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor<QueueCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
    };
  }
}
