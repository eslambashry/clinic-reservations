import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { DoctorRepository } from '../infrastructure/doctor.repository';

/** Clinical writes need eligibility as well as ownership; historical reads retain their existing scope. */
@Injectable()
export class AssertDoctorPrescribingEligibilityUseCase {
  constructor(@Inject(DoctorRepository) private readonly doctors: DoctorRepository) {}

  async execute(db: Prisma.TransactionClient, doctorId: string, lock = true): Promise<void> {
    if (lock) await this.doctors.lockForClinicalWrite(db, doctorId);
    const doctor = await this.doctors.findById(db, doctorId);
    if (!doctor || doctor.deleted_at) throw new NotFoundError('Doctor', doctorId);
    if (doctor.status !== 'VERIFIED') {
      throw new BusinessRuleError('DOCTOR_NOT_ELIGIBLE_TO_PRESCRIBE', 'لا يمكن إصدار روشتة أو اعتمادها للطبيب في حالته الحالية.');
    }
  }
}
