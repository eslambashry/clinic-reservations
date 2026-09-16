import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { ListStaffByContextUseCase } from '../../identity-auth/application/list-staff-by-context.use-case';
import { ProvisionStaffUserUseCase } from '../../identity-auth/application/provision-staff-user.use-case';
import { RoleMembershipRepository } from '../../identity-auth/infrastructure/role-membership.repository';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { CreatePharmacyStaffDto } from '../api/dto/create-pharmacy-staff.dto';
import {
  ProvisionedPharmacyStaffResponse,
  toProvisionedPharmacyStaffResponse,
} from '../domain/pharmacy-staff-response.util';
import { PharmacyBranchRepository } from '../infrastructure/pharmacy-branch.repository';
import { PharmacyStaffAssignmentRepository } from '../infrastructure/pharmacy-staff-assignment.repository';
import { PharmacyRepository } from '../infrastructure/pharmacy.repository';

const PHARMACY_STAFF_ROLE_CODE = 'PHARMACY_STAFF';

/**
 * `POST /v1/pharmacies/:pharmacyId/staff` — Admin provisions the pharmacy's
 * single staff account. Reuses identity-auth's `ProvisionStaffUserUseCase`
 * inside this transaction (same shape as `CreateAssistantUseCase`) so there
 * is exactly one provisioning mechanism; the password is generated there and
 * returned once, never accepted from the request body.
 *
 * `RoleMembership.context_id` is the `PharmacyBranch` id, mirrored 1:1 by a
 * `PharmacyStaffAssignment` row — the pairing `src/db/seed.ts` builds by hand.
 * Extended transaction timeout for the same reason as `CreateAssistantUseCase`:
 * several sequential writes including an argon2 hash.
 */
@Injectable()
export class CreatePharmacyStaffUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyRepository) private readonly pharmacies: PharmacyRepository,
    @Inject(PharmacyBranchRepository) private readonly branches: PharmacyBranchRepository,
    @Inject(PharmacyStaffAssignmentRepository) private readonly staffAssignments: PharmacyStaffAssignmentRepository,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
    @Inject(ListStaffByContextUseCase) private readonly listStaff: ListStaffByContextUseCase,
    @Inject(ProvisionStaffUserUseCase) private readonly provisionStaffUser: ProvisionStaffUserUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(
    pharmacyId: string,
    dto: CreatePharmacyStaffDto,
    actor: AccessTokenPayload,
  ): Promise<ProvisionedPharmacyStaffResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const pharmacy = await this.pharmacies.findById(tx, pharmacyId);
        if (!pharmacy || pharmacy.deleted_at) {
          throw new NotFoundError('Pharmacy', pharmacyId);
        }

        const branches = await this.branches.findByPharmacyId(tx, pharmacyId);
        if (branches.length === 0) {
          throw new BusinessRuleError(
            'PHARMACY_HAS_NO_BRANCH',
            'لا يمكن إنشاء حساب موظف قبل إضافة فرع للصيدلية.',
            { pharmacyId },
          );
        }

        const branch = dto.pharmacy_branch_id
          ? branches.find((b) => b.id === dto.pharmacy_branch_id)
          : branches.length === 1
            ? branches[0]
            : undefined;
        if (!branch) {
          // A branch id belonging to another pharmacy 404s rather than 400s —
          // same existence-hiding convention as `CreateAssistantUseCase`.
          if (dto.pharmacy_branch_id) {
            throw new NotFoundError('PharmacyBranch', dto.pharmacy_branch_id);
          }
          throw new BusinessRuleError(
            'PHARMACY_BRANCH_REQUIRED',
            'يجب تحديد الفرع لأن الصيدلية لديها أكثر من فرع.',
            { pharmacyId },
          );
        }

        // One staff account per pharmacy — checked across ALL branches, not
        // just the target one, because the invariant is per-pharmacy while
        // the membership is scoped per-branch.
        for (const candidate of branches) {
          const existing = await this.listStaff.execute({
            roleCode: PHARMACY_STAFF_ROLE_CODE,
            contextType: RoleContextType.PHARMACY_STAFF,
            contextId: candidate.id,
          });
          if (existing.length > 0) {
            throw new ConflictError(
              'PHARMACY_STAFF_ALREADY_PROVISIONED',
              'يوجد حساب موظف نشط بالفعل لهذه الصيدلية.',
              { pharmacyId },
            );
          }
        }

        const result = await this.provisionStaffUser.execute(tx, {
          phone: dto.phone,
          displayName: dto.display_name,
          roleCode: PHARMACY_STAFF_ROLE_CODE,
          contextType: RoleContextType.PHARMACY_STAFF,
          contextId: branch.id,
        });

        await this.roleMemberships.setTitleSubtitle(tx, result.roleMembershipId, {
          title: dto.title,
          subtitle: dto.subtitle,
        });
        await this.staffAssignments.create(tx, {
          userId: result.userId,
          pharmacyBranchId: branch.id,
          roleMembershipId: result.roleMembershipId,
        });

        await this.audit.record(tx, {
          actorUserId: actor.sub,
          actorRoleMembershipId: actor.roleMembershipId,
          action: 'provider_directory.pharmacy_staff.create',
          resourceType: 'role_membership',
          resourceId: result.roleMembershipId,
        });

        await this.outbox.emit(tx, 'PharmacyStaffProvisioned', {
          pharmacyId,
          pharmacyBranchId: branch.id,
          userId: result.userId,
          roleMembershipId: result.roleMembershipId,
        });

        return toProvisionedPharmacyStaffResponse(
          { ...result, title: dto.title, subtitle: dto.subtitle },
          branch.id,
        );
      },
      { timeout: 15000 },
    );
  }
}
