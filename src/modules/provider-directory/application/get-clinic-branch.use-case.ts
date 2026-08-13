import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { canBypassVisibility, isBranchVisible, isProviderEntityVisible } from '../domain/provider-visibility.rules';
import { ClinicBranchRepository, ClinicBranchWithRelations } from '../infrastructure/clinic-branch.repository';

@Injectable()
export class GetClinicBranchUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: ClinicBranchRepository,
  ) {}

  async execute(branchId: string, callerContextType: string | undefined): Promise<ClinicBranchWithRelations> {
    const isAdmin = canBypassVisibility(callerContextType);

    const branch = await this.branches.findByIdWithRelations(this.prisma, branchId);
    const visible =
      branch &&
      isBranchVisible({ status: branch.status }) &&
      isProviderEntityVisible({ status: branch.clinic.status, deletedAt: branch.clinic.deleted_at });

    if (!branch || (!isAdmin && !visible)) {
      throw new NotFoundError('ClinicBranch', branchId);
    }

    return branch;
  }
}
