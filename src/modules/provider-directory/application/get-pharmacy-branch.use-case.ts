import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { canBypassVisibility, isBranchVisible, isProviderEntityVisible } from '../domain/provider-visibility.rules';
import { PharmacyBranchRepository, PharmacyBranchWithRelations } from '../infrastructure/pharmacy-branch.repository';

@Injectable()
export class GetPharmacyBranchUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: PharmacyBranchRepository,
  ) {}

  async execute(branchId: string, callerContextType: string | undefined): Promise<PharmacyBranchWithRelations> {
    const isAdmin = canBypassVisibility(callerContextType);

    const branch = await this.branches.findByIdWithRelations(this.prisma, branchId);
    const visible =
      branch &&
      isBranchVisible({ status: branch.status }) &&
      isProviderEntityVisible({ status: branch.pharmacy.status, deletedAt: branch.pharmacy.deleted_at });

    if (!branch || (!isAdmin && !visible)) {
      throw new NotFoundError('PharmacyBranch', branchId);
    }

    return branch;
  }
}
