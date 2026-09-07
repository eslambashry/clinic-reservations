import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { UpdateStaffMembershipUseCase } from '../../identity-auth/application/update-staff-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { UpdateAssistantDto } from '../api/dto/update-assistant.dto';
import { AssistantResponse, toAssistantResponse, withGeneratedPassword } from '../domain/assistant-response.util';
import { AffiliationRepository } from '../infrastructure/affiliation.repository';
import { ClinicStaffAssignmentRepository } from '../infrastructure/clinic-staff-assignment.repository';
import { DoctorRepository } from '../infrastructure/doctor.repository';

const ASSISTANT_ROLE_CODE = 'CLINIC_STAFF';

/**
 * `PATCH /v1/provider/assistants/:id` — display name and/or ACTIVE/SUSPENDED
 * status. Ownership is enforced entirely inside `UpdateStaffMembershipUseCase`
 * (`contextId = doctor.id`), so another doctor's assistant id 404s here
 * rather than 403ing — never confirms the id exists at all.
 */
@Injectable()
export class UpdateAssistantUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(AffiliationRepository) private readonly affiliations: AffiliationRepository,
    @Inject(ClinicStaffAssignmentRepository) private readonly staffAssignments: ClinicStaffAssignmentRepository,
    @Inject(UpdateStaffMembershipUseCase) private readonly updateStaffMembership: UpdateStaffMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(assistantId: string, dto: UpdateAssistantDto, actor: AccessTokenPayload): Promise<AssistantResponse> {
    return this.prisma.$transaction(async (tx) => {
      const doctor = await this.doctors.findByUserId(tx, actor.sub);
      if (!doctor) {
        throw new NotFoundError('Doctor', actor.sub);
      }

      if (dto.clinic_branch_ids !== undefined) {
        const ownedBranchIds = new Set(
          (await this.affiliations.findByDoctorId(tx, doctor.id, false)).map((a) => a.clinic_branch_id),
        );
        for (const branchId of dto.clinic_branch_ids) {
          if (!ownedBranchIds.has(branchId)) {
            throw new NotFoundError('ClinicBranch', branchId);
          }
        }
      }

      const staff = await this.updateStaffMembership.execute(tx, {
        roleMembershipId: assistantId,
        roleCode: ASSISTANT_ROLE_CODE,
        contextType: RoleContextType.CLINIC_STAFF,
        contextId: doctor.id,
        displayName: dto.display_name,
        status: dto.status,
        password: dto.password,
        title: dto.title,
        subtitle: dto.subtitle,
      });

      if (dto.clinic_branch_ids !== undefined) {
        await this.staffAssignments.replaceForRoleMembership(tx, staff.roleMembershipId, dto.clinic_branch_ids);
        staff.clinicBranchIds = dto.clinic_branch_ids;
      } else {
        staff.clinicBranchIds = await this.staffAssignments.findClinicBranchIdsByRoleMembership(
          tx,
          staff.roleMembershipId,
        );
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.assistant.update',
        resourceType: 'role_membership',
        resourceId: staff.roleMembershipId,
      });

      return withGeneratedPassword(toAssistantResponse(staff), staff.generatedPassword);
    });
  }
}
