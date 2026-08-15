import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { canBypassVisibility, isBranchVisible, isProviderEntityVisible } from '../domain/provider-visibility.rules';
import { PharmacyRepository, PharmacyWithBranches } from '../infrastructure/pharmacy.repository';

@Injectable()
export class GetPharmacyUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyRepository) private readonly pharmacies: PharmacyRepository,
  ) {}

  async execute(pharmacyId: string, callerContextType: string | undefined): Promise<PharmacyWithBranches> {
    const isAdmin = canBypassVisibility(callerContextType);

    const pharmacy = await this.pharmacies.findByIdWithBranches(this.prisma, pharmacyId);
    if (!pharmacy || (!isAdmin && !isProviderEntityVisible({ status: pharmacy.status, deletedAt: pharmacy.deleted_at }))) {
      throw new NotFoundError('Pharmacy', pharmacyId);
    }

    if (isAdmin) {
      return pharmacy;
    }

    return { ...pharmacy, branches: pharmacy.branches.filter((b) => isBranchVisible({ status: b.status })) };
  }
}
