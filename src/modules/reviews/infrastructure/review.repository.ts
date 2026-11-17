import { Injectable } from '@nestjs/common';
import { Prisma, Review } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

const WITH_PATIENT = { patient: { select: { first_name: true, last_name: true } } } satisfies Prisma.ReviewInclude;
export type ReviewWithPatient = Prisma.ReviewGetPayload<{ include: typeof WITH_PATIENT }>;

export interface ListDoctorReviewsParams {
  doctorId: string;
  /** `undefined` = every status (admin). Public/doctor reads pass `PUBLISHED`. */
  status?: string;
  limit: number;
  cursor?: { c: string; i: string };
}

@Injectable()
export class ReviewRepository {
  create(
    db: Prisma.TransactionClient,
    input: { patientId: string; doctorId: string; appointmentId: string; rating: number; comment: string | null },
  ): Promise<Review> {
    return db.review.create({
      data: {
        patient_id: input.patientId,
        subject_type: 'DOCTOR',
        subject_id: input.doctorId,
        appointment_id: input.appointmentId,
        rating: input.rating,
        comment: input.comment,
        // Millisecond precision so the JS-side keyset cursor round-trips exactly (Postgres now() keeps microseconds).
        created_at: new Date(),
      },
    });
  }

  findByAppointmentId(db: Prisma.TransactionClient, appointmentId: string): Promise<Review | null> {
    return db.review.findUnique({ where: { appointment_id: appointmentId } });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Review | null> {
    return db.review.findUnique({ where: { id } });
  }

  async setStatus(db: Prisma.TransactionClient, id: string, currentVersion: number, status: string): Promise<void> {
    await updateWithOptimisticLock(db.review, id, currentVersion, { status });
  }

  /** Newest-first, keyset on `(created_at, id)`; fetches `limit + 1` so the caller can tell whether another page exists. */
  listForDoctor(db: Prisma.TransactionClient, params: ListDoctorReviewsParams): Promise<ReviewWithPatient[]> {
    return db.review.findMany({
      where: {
        subject_type: 'DOCTOR',
        subject_id: params.doctorId,
        ...(params.status && { status: params.status }),
        ...(params.cursor && {
          OR: [
            { created_at: { lt: new Date(params.cursor.c) } },
            { created_at: new Date(params.cursor.c), id: { lt: params.cursor.i } },
          ],
        }),
      },
      include: WITH_PATIENT,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
    });
  }

  /** Admin offset listing. */
  async listForAdmin(
    db: Prisma.TransactionClient,
    params: { doctorId?: string; status?: string; skip: number; take: number },
  ): Promise<{ rows: ReviewWithPatient[]; total: number }> {
    const where: Prisma.ReviewWhereInput = {
      subject_type: 'DOCTOR',
      ...(params.doctorId && { subject_id: params.doctorId }),
      ...(params.status && { status: params.status }),
    };
    const [rows, total] = await Promise.all([
      db.review.findMany({ where, include: WITH_PATIENT, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: params.skip, take: params.take }),
      db.review.count({ where }),
    ]);
    return { rows, total };
  }

  /** `{ [stars]: count }` over PUBLISHED reviews only. */
  async countsByRating(db: Prisma.TransactionClient, doctorId: string): Promise<Record<number, number>> {
    const groups = await db.review.groupBy({
      by: ['rating'],
      where: { subject_type: 'DOCTOR', subject_id: doctorId, status: 'PUBLISHED' },
      _count: { _all: true },
    });
    return Object.fromEntries(groups.map((g) => [g.rating, g._count._all]));
  }
}
