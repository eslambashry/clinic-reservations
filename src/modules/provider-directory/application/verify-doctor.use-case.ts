import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { GrantRoleMembershipUseCase } from '../../identity-auth/application/grant-role-membership.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository } from '../infrastructure/doctor.repository';

/**
 * File 11 Part 03/07.3: Admin-only manual verification. File 12 Part 32.13:
 * idempotent-safe — re-verifying an already-VERIFIED doctor is a no-op
 * success, not an error. Emits `ProviderVerified` (Part 32.2: fires for the
 * top-level entity only) in the same transaction as the status write.
 *
 * 2026-09-03: also grants the applicant a real DOCTOR role_membership
 * (`GrantRoleMembershipUseCase`) in the same transaction as the status
 * write. Before this, self-registration (`SelfRegisterProviderUseCase`)
 * never grants any role_membership — by its own doc comment — so a
 * VERIFIED doctor's JWT stayed PATIENT forever, with no way to ever reach
 * `/provider/*` surfaces: confirmed live, the frontend's pending-approval
 * screen would show "approved" and its own "go to dashboard" action would
 * loop the user straight back to itself. Granting the membership here is
 * necessary but not sufficient — the caller must sign in again afterward
 * (their current access token is unaffected) for the new membership to
 * actually take effect, since `RoleMembershipRepository.findActiveByUser`'s
 * most-recent-first ordering only gets consulted at the next
 * login/refresh, never retroactively on an already-issued token.
 */
@Injectable()
export class VerifyDoctorUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(GrantRoleMembershipUseCase) private readonly grantRoleMembership: GrantRoleMembershipUseCase,
  ) {}

  async execute(doctorId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const doctor = await this.doctors.findById(tx, doctorId);
      if (!doctor) {
        throw new NotFoundError('Doctor', doctorId);
      }

      await this.doctors.setStatus(tx, doctorId, doctor.version, 'VERIFIED');

      await this.grantRoleMembership.execute(tx, {
        userId: doctor.user_id,
        roleCode: 'DOCTOR',
        contextType: RoleContextType.DOCTOR,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.doctor.verify',
        resourceType: 'doctor',
        resourceId: doctorId,
        reasonCode: `previous_status:${doctor.status}`,
      });

      await this.outbox.emit(tx, 'ProviderVerified', { providerType: 'DOCTOR', providerId: doctorId });
    });
  }
}
