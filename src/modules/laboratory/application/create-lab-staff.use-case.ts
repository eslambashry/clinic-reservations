import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { ProvisionStaffUserUseCase } from '../../identity-auth/application/provision-staff-user.use-case';
import { RoleMembershipRepository } from '../../identity-auth/infrastructure/role-membership.repository';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { CreateLabStaffDto } from '../api/dto/create-lab-staff.dto';
import { ProvisionedLabStaffResponse, toProvisionedLabStaffResponse } from '../domain/lab-staff-response.util';
import { LabStaffAssignmentRepository } from '../infrastructure/lab-staff-assignment.repository';
import { LAB_STAFF_ROLE_CODE, ResolveLabStaffUseCase } from './resolve-lab-staff.use-case';

/**
 * `POST /v1/laboratories/:labId/staff` — provisions the laboratory's single
 * `LAB_STAFF` account and returns its one-time password once. The identity
 * writes are delegated to `ProvisionStaffUserUseCase` inside this
 * transaction so the one-per-laboratory check, the user/membership write,
 * the `LabStaffAssignment` mirror, the audit entry and the outbox event all
 * commit atomically — same shape as `CreateAssistantUseCase`. Extended
 * transaction timeout for the same reason: several sequential writes
 * including an argon2 hash.
 */
@Injectable()
export class CreateLabStaffUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveLabStaffUseCase) private readonly resolveLabStaff: ResolveLabStaffUseCase,
    @Inject(LabStaffAssignmentRepository) private readonly staffAssignments: LabStaffAssignmentRepository,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
    @Inject(ProvisionStaffUserUseCase) private readonly provisionStaffUser: ProvisionStaffUserUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(
    laboratoryId: string,
    dto: CreateLabStaffDto,
    actor: AccessTokenPayload,
  ): Promise<ProvisionedLabStaffResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const branches = await this.resolveLabStaff.requireLaboratoryBranches(tx, laboratoryId);
        await this.staffAssignments.acquireProvisioningLock(tx, laboratoryId);
        if (branches.length === 0) {
          throw new BusinessRuleError(
            'LAB_HAS_NO_BRANCH',
            'لا يمكن إنشاء حساب موظف قبل إضافة فرع للمعمل.',
            { laboratoryId },
          );
        }

        const existing = await this.resolveLabStaff.findActive(tx, laboratoryId);
        if (existing) {
          throw new ConflictError('LAB_STAFF_ALREADY_PROVISIONED', 'هذا المعمل لديه حساب موظف بالفعل.', {
            laboratoryId,
          });
        }

        // A `LAB_STAFF` membership is scoped to one branch, so a multi-branch
        // laboratory must say which — anything else would silently pick for
        // the admin. Same existence-hiding convention as elsewhere: a branch
        // id outside this laboratory 404s rather than 400/403ing.
        let labBranchId: string;
        if (dto.lab_branch_id) {
          const owned = branches.find((b) => b.id === dto.lab_branch_id);
          if (!owned) {
            throw new NotFoundError('LabBranch', dto.lab_branch_id);
          }
          labBranchId = owned.id;
        } else if (branches.length === 1) {
          labBranchId = branches[0].id;
        } else {
          throw new BusinessRuleError(
            'LAB_BRANCH_REQUIRED',
            'يجب تحديد الفرع لأن المعمل لديه أكثر من فرع.',
            { laboratoryId },
          );
        }

        const result = await this.provisionStaffUser.execute(tx, {
          phone: dto.phone,
          displayName: dto.display_name,
          roleCode: LAB_STAFF_ROLE_CODE,
          contextType: RoleContextType.LAB_STAFF,
          contextId: labBranchId,
        });

        await this.roleMemberships.setTitleSubtitle(tx, result.roleMembershipId, {
          title: dto.title,
          subtitle: dto.subtitle,
        });
        await this.staffAssignments.create(tx, {
          userId: result.userId,
          labBranchId,
          roleMembershipId: result.roleMembershipId,
        });

        await this.audit.record(tx, {
          actorUserId: actor.sub,
          actorRoleMembershipId: actor.roleMembershipId,
          action: 'laboratory.lab_staff.create',
          resourceType: 'role_membership',
          resourceId: result.roleMembershipId,
        });

        await this.outbox.emit(tx, 'LabStaffProvisioned', {
          laboratoryId,
          labBranchId,
          userId: result.userId,
          roleMembershipId: result.roleMembershipId,
        });

        return toProvisionedLabStaffResponse(result, labBranchId, dto.title, dto.subtitle);
      },
      { timeout: 15000 },
    );
  }
}
