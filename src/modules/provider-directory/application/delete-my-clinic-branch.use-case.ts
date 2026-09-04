import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ResolveDoctorScopeUseCase } from './resolve-doctor-scope.use-case';

@Injectable()
export class DeleteMyClinicBranchUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(branchId: string, actor: AccessTokenPayload): Promise<void> {
    const scope = await this.doctorScope.execute(actor);
    const owned = scope.affiliations.find((item) => item.clinicBranchId === branchId);
    if (!owned) throw new NotFoundError('ClinicBranch', branchId);

    await this.prisma.$transaction(async (tx) => {
      const appointments = await tx.appointment.count({
        where: {
          doctor_clinic_affiliation_id: owned.affiliationId,
          status: { in: ['HELD', 'CONFIRMED'] },
        },
      });
      if (appointments > 0) {
        throw new ConflictError(
          'BRANCH_HAS_BOOKINGS',
          'لا يمكن حذف الفرع لأنه يحتوي على مواعيد محجوزة.',
          { branchId, appointments },
        );
      }

      const otherOwners = await tx.doctorClinicAffiliation.count({
        where: { clinic_branch_id: branchId, doctor_id: { not: scope.doctorId } },
      });
      const branch = await tx.clinicBranch.findUnique({ where: { id: branchId }, select: { address_id: true } });
      if (!branch) throw new NotFoundError('ClinicBranch', branchId);

      await tx.doctorClinicAffiliation.delete({ where: { id: owned.affiliationId } });
      if (otherOwners === 0) {
        await tx.clinicBranch.delete({ where: { id: branchId } });
        await tx.address.delete({ where: { id: branch.address_id } });
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.doctor.branch.delete',
        resourceType: 'clinic_branch',
        resourceId: branchId,
      });
    });
  }
}
