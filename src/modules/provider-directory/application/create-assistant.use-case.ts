import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { ProvisionStaffUserUseCase } from '../../identity-auth/application/provision-staff-user.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { CreateAssistantDto } from '../api/dto/create-assistant.dto';
import { ProvisionedAssistantResponse, toProvisionedAssistantResponse } from '../domain/assistant-response.util';
import { DoctorRepository } from '../infrastructure/doctor.repository';

const ASSISTANT_ROLE_CODE = 'CLINIC_STAFF';

/**
 * `POST /v1/provider/assistants` — provisions a `CLINIC_STAFF` account owned
 * by the calling doctor (`RoleMembership.context_id = Doctor.id`, never
 * `User.id`). Delegates the actual identity-table writes to identity-auth's
 * `ProvisionStaffUserUseCase` inside this transaction so the doctor-existence
 * check, the user/membership write, and the audit log all commit atomically
 * — same shape as `VerifyDoctorUseCase` calling `GrantRoleMembershipUseCase`.
 * Extended transaction timeout: several sequential writes (find/create user,
 * hash password, create/reactivate membership, audit, outbox), same
 * reasoning as `VerifyOtpUseCase`.
 */
@Injectable()
export class CreateAssistantUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(ProvisionStaffUserUseCase) private readonly provisionStaffUser: ProvisionStaffUserUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(dto: CreateAssistantDto, actor: AccessTokenPayload): Promise<ProvisionedAssistantResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const doctor = await this.doctors.findByUserId(tx, actor.sub);
        if (!doctor) {
          throw new NotFoundError('Doctor', actor.sub);
        }

        const result = await this.provisionStaffUser.execute(tx, {
          phone: dto.phone,
          displayName: dto.display_name,
          roleCode: ASSISTANT_ROLE_CODE,
          contextType: RoleContextType.CLINIC_STAFF,
          contextId: doctor.id,
        });

        await this.audit.record(tx, {
          actorUserId: actor.sub,
          actorRoleMembershipId: actor.roleMembershipId,
          action: 'provider_directory.assistant.create',
          resourceType: 'role_membership',
          resourceId: result.roleMembershipId,
        });

        await this.outbox.emit(tx, 'AssistantProvisioned', {
          doctorId: doctor.id,
          userId: result.userId,
          roleMembershipId: result.roleMembershipId,
        });

        return toProvisionedAssistantResponse(result);
      },
      { timeout: 15000 },
    );
  }
}
