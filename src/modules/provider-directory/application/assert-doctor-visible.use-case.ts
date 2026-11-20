import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { canBypassVisibility, isProviderEntityVisible } from '../domain/provider-visibility.rules';
import { DoctorRepository } from '../infrastructure/doctor.repository';

/**
 * Application-layer seam for `reviews`: the same public-visibility rule as
 * `GetDoctorUseCase` (VERIFIED and not soft-deleted; Admin bypasses), so a
 * doctor hidden from the directory never leaks data through a sibling route.
 */
@Injectable()
export class AssertDoctorVisibleUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
  ) {}

  async execute(doctorId: string, callerContextType: string | undefined): Promise<void> {
    if (canBypassVisibility(callerContextType)) {
      return;
    }
    const doctor = await this.doctors.findById(this.prisma, doctorId);
    if (!doctor || !isProviderEntityVisible({ status: doctor.status, deletedAt: doctor.deleted_at })) {
      throw new NotFoundError('Doctor', doctorId);
    }
  }
}
