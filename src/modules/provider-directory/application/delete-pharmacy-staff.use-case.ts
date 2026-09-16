import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { RevokeStaffMembershipUseCase } from '../../identity-auth/application/revoke-staff-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PharmacyStaffAssignmentRepository } from '../infrastructure/pharmacy-staff-assignment.repository';
import { PharmacyRepository } from '../infrastructure/pharmacy.repository';

const PHARMACY_STAFF_ROLE_CODE = 'PHARMACY_STAFF';

/**
 * `DELETE /v1/pharmacies/:pharmacyId/staff/:id` — revokes the
 * `RoleMembership`, never a physical delete. The `PharmacyStaffAssignment`
 * mirror row is deliberately left in place: it is not a second source of
 * truth for active/revoked, so deleting it would destroy the FK-verified
 * history without changing any authorization outcome. Freeing the pharmacy
 * to be re-provisioned works because the one-per-pharmacy check on create
 * only counts ACTIVE memberships.
 */
@Injectable()
export class DeletePharmacyStaffUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyRepository) private readonly pharmacies: PharmacyRepository,
    @Inject(PharmacyStaffAssignmentRepository) private readonly staffAssignments: PharmacyStaffAssignmentRepository,
    @Inject(RevokeStaffMembershipUseCase) private readonly revokeStaffMembership: RevokeStaffMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(pharmacyId: string, staffId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const pharmacy = await this.pharmacies.findById(tx, pharmacyId);
      if (!pharmacy || pharmacy.deleted_at) {
        throw new NotFoundError('Pharmacy', pharmacyId);
      }

      const branchId = await this.staffAssignments.findBranchIdForPharmacy(tx, {
        roleMembershipId: staffId,
        pharmacyId,
      });
      if (!branchId) {
        throw new NotFoundError('PharmacyStaff', staffId);
      }

      await this.revokeStaffMembership.execute(tx, {
        roleMembershipId: staffId,
        roleCode: PHARMACY_STAFF_ROLE_CODE,
        contextType: RoleContextType.PHARMACY_STAFF,
        contextId: branchId,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.pharmacy_staff.revoke',
        resourceType: 'role_membership',
        resourceId: staffId,
      });
    });
  }
}
