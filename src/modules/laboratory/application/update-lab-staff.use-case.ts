import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { UpdateStaffMembershipUseCase } from '../../identity-auth/application/update-staff-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { UpdateLabStaffDto } from '../api/dto/update-lab-staff.dto';
import { LabStaffResponse, toLabStaffResponse, withGeneratedPassword } from '../domain/lab-staff-response.util';
import { LabStaffAssignmentRepository } from '../infrastructure/lab-staff-assignment.repository';
import { LaboratoryRepository } from '../infrastructure/laboratory.repository';
import { LAB_STAFF_ROLE_CODE } from './resolve-lab-staff.use-case';

/**
 * `PATCH /v1/laboratories/:laboratoryId/staff/:id` — display name, title,
 * ACTIVE/SUSPENDED status and/or a reset password. A `LAB_STAFF` membership
 * is scoped to a `LabBranch`, so the owning branch is resolved through the
 * laboratory-scoped assignment lookup: a staff id belonging to another
 * laboratory 404s rather than 403ing.
 */
@Injectable()
export class UpdateLabStaffUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LaboratoryRepository) private readonly laboratories: LaboratoryRepository,
    @Inject(LabStaffAssignmentRepository) private readonly staffAssignments: LabStaffAssignmentRepository,
    @Inject(UpdateStaffMembershipUseCase) private readonly updateStaffMembership: UpdateStaffMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(
    laboratoryId: string,
    staffId: string,
    dto: UpdateLabStaffDto,
    actor: AccessTokenPayload,
  ): Promise<LabStaffResponse> {
    return this.prisma.$transaction(async (tx) => {
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

      const staff = await this.updateStaffMembership.execute(tx, {
        roleMembershipId: staffId,
        roleCode: LAB_STAFF_ROLE_CODE,
        contextType: RoleContextType.LAB_STAFF,
        contextId: branchId,
        displayName: dto.display_name,
        status: dto.status,
        password: dto.password,
        title: dto.title,
        subtitle: dto.subtitle,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'laboratory.lab_staff.update',
        resourceType: 'role_membership',
        resourceId: staff.roleMembershipId,
      });

      return withGeneratedPassword(toLabStaffResponse(staff, branchId), staff.generatedPassword);
    });
  }
}
