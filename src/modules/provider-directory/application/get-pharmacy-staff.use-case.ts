import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { ListStaffByContextUseCase } from '../../identity-auth/application/list-staff-by-context.use-case';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyStaffResponse, toPharmacyStaffResponse } from '../domain/pharmacy-staff-response.util';
import { PharmacyBranchRepository } from '../infrastructure/pharmacy-branch.repository';
import { PharmacyRepository } from '../infrastructure/pharmacy.repository';

const PHARMACY_STAFF_ROLE_CODE = 'PHARMACY_STAFF';

/**
 * `GET /v1/pharmacies/:pharmacyId/staff` — a pharmacy has exactly one staff
 * account, so this returns the single active one or `null`, not a list.
 * `RoleMembership.context_id` is the `PharmacyBranch` id (not the pharmacy
 * id), so every branch of the pharmacy is consulted; the one-per-pharmacy
 * invariant enforced on create means at most one can come back.
 */
@Injectable()
export class GetPharmacyStaffUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyRepository) private readonly pharmacies: PharmacyRepository,
    @Inject(PharmacyBranchRepository) private readonly branches: PharmacyBranchRepository,
    @Inject(ListStaffByContextUseCase) private readonly listStaff: ListStaffByContextUseCase,
  ) {}

  async execute(pharmacyId: string): Promise<PharmacyStaffResponse | null> {
    const pharmacy = await this.pharmacies.findById(this.prisma, pharmacyId);
    if (!pharmacy || pharmacy.deleted_at) {
      throw new NotFoundError('Pharmacy', pharmacyId);
    }

    const branches = await this.branches.findByPharmacyId(this.prisma, pharmacyId);
    for (const branch of branches) {
      const staff = await this.listStaff.execute({
        roleCode: PHARMACY_STAFF_ROLE_CODE,
        contextType: RoleContextType.PHARMACY_STAFF,
        contextId: branch.id,
      });
      const active = staff[0];
      if (active) {
        return toPharmacyStaffResponse(active, branch.id);
      }
    }

    return null;
  }
}
