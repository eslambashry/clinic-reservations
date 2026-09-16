import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LaboratoryRepository, LaboratoryWithBranches } from '../infrastructure/laboratory.repository';

/**
 * Admin-only detail, unlike `GetPharmacyUseCase` (which is `@OptionalAuth()`
 * public and therefore needs `provider-visibility.rules.ts`): the laboratory
 * directory has no patient-facing entity-level browse — patients reach labs
 * through `GET /lab-branches/search`, which does its own VERIFIED filtering.
 * So no status/visibility computation belongs here; the route's
 * `@Roles(ADMIN)` is the whole access decision.
 */
@Injectable()
export class GetLaboratoryUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LaboratoryRepository) private readonly laboratories: LaboratoryRepository,
  ) {}

  async execute(laboratoryId: string): Promise<LaboratoryWithBranches> {
    const laboratory = await this.laboratories.findByIdWithBranches(this.prisma, laboratoryId);
    if (!laboratory || laboratory.deleted_at) {
      throw new NotFoundError('Laboratory', laboratoryId);
    }
    return laboratory;
  }
}
