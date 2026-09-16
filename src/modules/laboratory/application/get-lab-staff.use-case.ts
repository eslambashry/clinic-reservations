import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LabStaffResponse, toLabStaffResponse } from '../domain/lab-staff-response.util';
import { ResolveLabStaffUseCase } from './resolve-lab-staff.use-case';

/** `GET /v1/laboratories/:labId/staff` — the laboratory's single staff account, or `null` when none is provisioned yet. */
@Injectable()
export class GetLabStaffUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveLabStaffUseCase) private readonly resolveLabStaff: ResolveLabStaffUseCase,
  ) {}

  async execute(laboratoryId: string): Promise<LabStaffResponse | null> {
    const resolved = await this.resolveLabStaff.findActive(this.prisma, laboratoryId);
    return resolved ? toLabStaffResponse(resolved.staff, resolved.labBranchId) : null;
  }
}
