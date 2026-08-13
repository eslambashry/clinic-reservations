import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
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
 */
@Injectable()
export class VerifyDoctorUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly doctors: DoctorRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(doctorId: string, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const doctor = await this.doctors.findById(tx, doctorId);
      if (!doctor) {
        throw new NotFoundError('Doctor', doctorId);
      }

      await this.doctors.setStatus(tx, doctorId, doctor.version, 'VERIFIED');

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
