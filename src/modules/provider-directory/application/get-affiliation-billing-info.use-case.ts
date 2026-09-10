import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';
import { DoctorRepository } from '../infrastructure/doctor.repository';

export interface AffiliationBillingInfo {
  consultFee: string;
  currency: string;
  doctorId: string;
  /** `Doctor.user_id` — the doctor's own `User` row, for callers (like
   * appointment confirmation) that need to notify the doctor themselves,
   * not just bill against their affiliation. */
  doctorUserId: string;
  /** The branch this affiliation books into — callers use this to notify
   * only the assistants assigned to that specific branch, not every
   * assistant the doctor has across all their branches. */
  clinicBranchId: string;
}

/**
 * File 12 Part 36.3 — `payments`' only way to read what an appointment
 * confirm should charge. Unlike this module's other two exports
 * (`ResolveAffiliationForSchedulingUseCase`/`ListSchedulableAffiliationsUseCase`,
 * both of which inject `PrismaService` and open their own implicit
 * connection), this one takes `tx: Prisma.TransactionClient` explicitly —
 * the consult-fee read must happen inside the same transaction that later
 * captures a payment against it, or a rate change could land between the
 * read and the write it feeds.
 */
@Injectable()
export class GetAffiliationBillingInfoUseCase {
  constructor(
    @Inject(AffiliationRepository) private readonly affiliations: AffiliationRepository,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, affiliationId: string): Promise<AffiliationBillingInfo> {
    const affiliation = await this.affiliations.findById(tx, affiliationId);
    if (!affiliation) {
      throw new NotFoundError('DoctorClinicAffiliation', affiliationId);
    }

    const doctor = await this.doctors.findById(tx, affiliation.doctor_id);
    if (!doctor) {
      throw new NotFoundError('Doctor', affiliation.doctor_id);
    }

    return {
      consultFee: affiliation.consult_fee.toString(),
      currency: affiliation.currency,
      doctorId: affiliation.doctor_id,
      doctorUserId: doctor.user_id,
      clinicBranchId: affiliation.clinic_branch_id,
    };
  }
}
