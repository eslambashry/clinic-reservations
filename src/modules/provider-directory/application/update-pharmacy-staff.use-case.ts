import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { UpdateStaffMembershipUseCase } from '../../identity-auth/application/update-staff-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { UpdatePharmacyStaffDto } from '../api/dto/update-pharmacy-staff.dto';
import { PharmacyStaffResponse, toPharmacyStaffResponse } from '../domain/pharmacy-staff-response.util';
import { PharmacyStaffAssignmentRepository } from '../infrastructure/pharmacy-staff-assignment.repository';
import { PharmacyRepository } from '../infrastructure/pharmacy.repository';

const PHARMACY_STAFF_ROLE_CODE = 'PHARMACY_STAFF';

/**
 * `PATCH /v1/pharmacies/:pharmacyId/staff/:id` — display name and/or
 * ACTIVE/SUSPENDED. `UpdateStaffMembershipUseCase` scopes its lookup by
 * `contextId`, and the branch resolution below is itself scoped to this
 * pharmacy, so a staff id belonging to another pharmacy 404s rather than
 * 403s — never confirms the id exists at all.
 */
@Injectable()
export class UpdatePharmacyStaffUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PharmacyRepository) private readonly pharmacies: PharmacyRepository,
    @Inject(PharmacyStaffAssignmentRepository) private readonly staffAssignments: PharmacyStaffAssignmentRepository,
    @Inject(UpdateStaffMembershipUseCase) private readonly updateStaffMembership: UpdateStaffMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(
    pharmacyId: string,
    staffId: string,
    dto: UpdatePharmacyStaffDto,
    actor: AccessTokenPayload,
  ): Promise<PharmacyStaffResponse> {
    return this.prisma.$transaction(async (tx) => {
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

      const staff = await this.updateStaffMembership.execute(tx, {
        roleMembershipId: staffId,
        roleCode: PHARMACY_STAFF_ROLE_CODE,
        contextType: RoleContextType.PHARMACY_STAFF,
        contextId: branchId,
        displayName: dto.display_name,
        status: dto.status,
        title: dto.title,
        subtitle: dto.subtitle,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.pharmacy_staff.update',
        resourceType: 'role_membership',
        resourceId: staff.roleMembershipId,
      });

      return toPharmacyStaffResponse(staff, branchId);
    });
  }
}
