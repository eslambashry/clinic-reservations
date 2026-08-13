import { Injectable } from '@nestjs/common';
import { DoctorClinicAffiliation, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface CreateAffiliationInput {
  doctorId: string;
  clinicBranchId: string;
  consultFee: string;
  currency: string;
}

export interface UpdateAffiliationInput {
  status?: 'ACTIVE' | 'PAUSED';
  consultFee?: string;
  currency?: string;
}

const AFFILIATION_WITH_BRANCH = {
  clinic_branch: { include: { address: true, clinic: true } },
} satisfies Prisma.DoctorClinicAffiliationInclude;
export type AffiliationWithBranch = Prisma.DoctorClinicAffiliationGetPayload<{
  include: typeof AFFILIATION_WITH_BRANCH;
}>;

@Injectable()
export class AffiliationRepository {
  create(db: Prisma.TransactionClient, input: CreateAffiliationInput): Promise<DoctorClinicAffiliation> {
    return db.doctorClinicAffiliation.create({
      data: {
        doctor_id: input.doctorId,
        clinic_branch_id: input.clinicBranchId,
        consult_fee: input.consultFee,
        currency: input.currency,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<DoctorClinicAffiliation | null> {
    return db.doctorClinicAffiliation.findUnique({ where: { id } });
  }

  /** `onlyActive=false` (Admin view) returns every affiliation regardless of status. */
  findByDoctorId(
    db: Prisma.TransactionClient,
    doctorId: string,
    onlyActive: boolean,
  ): Promise<AffiliationWithBranch[]> {
    return db.doctorClinicAffiliation.findMany({
      where: { doctor_id: doctorId, ...(onlyActive && { status: 'ACTIVE' }) },
      include: AFFILIATION_WITH_BRANCH,
    });
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: UpdateAffiliationInput,
  ): Promise<void> {
    await updateWithOptimisticLock(db.doctorClinicAffiliation, id, currentVersion, {
      ...(input.status !== undefined && { status: input.status }),
      ...(input.consultFee !== undefined && { consult_fee: input.consultFee }),
      ...(input.currency !== undefined && { currency: input.currency }),
    });
  }
}
