import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { canBypassVisibility, isBranchVisible, isProviderEntityVisible } from '../domain/provider-visibility.rules';
import { ClinicRepository, ClinicWithBranches } from '../infrastructure/clinic.repository';

@Injectable()
export class GetClinicUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClinicRepository) private readonly clinics: ClinicRepository,
  ) {}

  async execute(clinicId: string, callerContextType: string | undefined): Promise<ClinicWithBranches> {
    const isAdmin = canBypassVisibility(callerContextType);

    const clinic = await this.clinics.findByIdWithBranches(this.prisma, clinicId);
    if (!clinic || (!isAdmin && !isProviderEntityVisible({ status: clinic.status, deletedAt: clinic.deleted_at }))) {
      throw new NotFoundError('Clinic', clinicId);
    }

    if (isAdmin) {
      return clinic;
    }

    return { ...clinic, branches: clinic.branches.filter((b) => isBranchVisible({ status: b.status })) };
  }
}
