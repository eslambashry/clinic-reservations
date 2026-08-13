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

const AFFILIATION_WITH_VISIBILITY_CHAIN = {
  doctor: true,
  clinic_branch: { include: { clinic: true } },
} satisfies Prisma.DoctorClinicAffiliationInclude;
export type AffiliationWithVisibilityChain = Prisma.DoctorClinicAffiliationGetPayload<{
  include: typeof AFFILIATION_WITH_VISIBILITY_CHAIN;
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

  /** File 12 Part 33.3 — resolves the `doctorId`+`clinicBranchId` pair scheduling needs, with the full visibility chain attached. */
  findByDoctorAndBranch(
    db: Prisma.TransactionClient,
    doctorId: string,
    clinicBranchId: string,
  ): Promise<AffiliationWithVisibilityChain | null> {
    return db.doctorClinicAffiliation.findUnique({
      where: { doctor_id_clinic_branch_id: { doctor_id: doctorId, clinic_branch_id: clinicBranchId } },
      include: AFFILIATION_WITH_VISIBILITY_CHAIN,
    });
  }

  /** Batch form for the slot-generation job (Part 33.3) — only the visibility chain fields, keyed for a `Map` lookup. */
  findManyByIdsWithVisibilityChain(
    db: Prisma.TransactionClient,
    affiliationIds: string[],
  ): Promise<AffiliationWithVisibilityChain[]> {
    return db.doctorClinicAffiliation.findMany({
      where: { id: { in: affiliationIds } },
      include: AFFILIATION_WITH_VISIBILITY_CHAIN,
    });
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
