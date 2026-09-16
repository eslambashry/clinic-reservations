import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { RevokeStaffMembershipUseCase } from '../../identity-auth/application/revoke-staff-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { LabStaffAssignmentRepository } from '../infrastructure/lab-staff-assignment.repository';
import { LaboratoryRepository } from '../infrastructure/laboratory.repository';
import { LAB_STAFF_ROLE_CODE } from './resolve-lab-staff.use-case';

/**
 * `DELETE /v1/laboratories/:laboratoryId/staff/:id` — revokes the
 * `RoleMembership`, never a physical delete (File 12 Part 05). The
 * `LabStaffAssignment` mirror row is deliberately left in place: it is keyed
 * 1:1 to the membership whose REVOKED status is the single source of truth,
 * and every read of it already filters on `role_membership.status = ACTIVE`,
 * so deleting it here would duplicate that fact rather than record it — and
 * would also lose the audit trail of which branch the account had been bound
 * to.
 */
@Injectable()
export class DeleteLabStaffUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LaboratoryRepository) private readonly laboratories: LaboratoryRepository,
    @Inject(LabStaffAssignmentRepository) private readonly staffAssignments: LabStaffAssignmentRepository,
    @Inject(RevokeStaffMembershipUseCase) private readonly revokeStaffMembership: RevokeStaffMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(laboratoryId: string, staffId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const laboratory = await this.laboratories.findById(tx, laboratoryId);
      if (!laboratory || laboratory.deleted_at) {
        throw new NotFoundError('Laboratory', laboratoryId);
      }

      const branchId = await this.staffAssignments.findBranchIdForLaboratory(tx, {
        roleMembershipId: staffId,
        laboratoryId,
      });
      if (!branchId) {
        throw new NotFoundError('LabStaff', staffId);
      }

      await this.revokeStaffMembership.execute(tx, {
        roleMembershipId: staffId,
        roleCode: LAB_STAFF_ROLE_CODE,
        contextType: RoleContextType.LAB_STAFF,
        contextId: branchId,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'laboratory.lab_staff.revoke',
        resourceType: 'role_membership',
        resourceId: staffId,
      });
    });
  }
}
