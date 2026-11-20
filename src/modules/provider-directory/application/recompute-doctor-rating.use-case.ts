import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { DoctorRepository } from '../infrastructure/doctor.repository';

export interface DoctorRatingAggregate {
  avg: number;
  count: number;
}

/**
 * Application-layer seam for `reviews`: `doctors.rating_avg`/`rating_count`
 * are this module's columns, so `reviews` never writes them directly. The
 * caller's transaction is used; the doctor row is locked first so two
 * concurrent reviews serialise and the last aggregate written is the one
 * computed over every committed review.
 */
@Injectable()
export class RecomputeDoctorRatingUseCase {
  constructor(@Inject(DoctorRepository) private readonly doctors: DoctorRepository) {}

  async execute(
    tx: Prisma.TransactionClient,
    doctorId: string,
    aggregate: () => Promise<DoctorRatingAggregate>,
  ): Promise<{ doctorUserId: string }> {
    const doctor = await this.doctors.findById(tx, doctorId);
    if (!doctor) {
      throw new NotFoundError('Doctor', doctorId);
    }
    await this.doctors.lockForClinicalWrite(tx, doctorId);
    const { avg, count } = await aggregate();
    await this.doctors.setRating(tx, doctorId, avg, count);
    return { doctorUserId: doctor.user_id };
  }
}
