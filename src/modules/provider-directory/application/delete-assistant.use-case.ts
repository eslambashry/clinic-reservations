import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { RevokeStaffMembershipUseCase } from '../../identity-auth/application/revoke-staff-membership.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository } from '../infrastructure/doctor.repository';

const ASSISTANT_ROLE_CODE = 'CLINIC_STAFF';

/** `DELETE /v1/provider/assistants/:id` — soft-deactivates (revokes the `RoleMembership`), never a physical delete. Ownership-scoped the same way as update. */
@Injectable()
export class DeleteAssistantUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(RevokeStaffMembershipUseCase) private readonly revokeStaffMembership: RevokeStaffMembershipUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(assistantId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const doctor = await this.doctors.findByUserId(tx, actor.sub);
      if (!doctor) {
        throw new NotFoundError('Doctor', actor.sub);
      }

      await this.revokeStaffMembership.execute(tx, {
        roleMembershipId: assistantId,
        roleCode: ASSISTANT_ROLE_CODE,
        contextType: RoleContextType.CLINIC_STAFF,
        contextId: doctor.id,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.assistant.revoke',
        resourceType: 'role_membership',
        resourceId: assistantId,
      });
    });
  }
}
