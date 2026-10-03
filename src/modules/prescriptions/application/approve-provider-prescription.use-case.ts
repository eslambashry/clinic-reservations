import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';

export interface ApproveProviderPrescriptionResult {
  prescriptionId: string;
  status: 'ACCEPTED';
}

/**
 * File 12 Part 51 — `PENDING_DOCTOR_APPROVAL --> ACCEPTED`. `DOCTOR`-only
 * (never `CLINIC_STAFF` — an assistant cannot self-sign their own draft, the
 * prompt's explicit conservative rule). The caller must be the *supervising*
 * doctor named on the draft (`prescription.doctor_id`) — a different
 * doctor's pending draft 404s, same existence-hiding convention as
 * `ResolveDoctorScopeUseCase`, so "approval by the wrong doctor" cannot even
 * confirm the draft exists. Approving sets `status: ACCEPTED` directly (the
 * same value a DOCTOR-direct create uses), which is what makes the
 * prescription flow into the existing `PharmacyOrder` path — no separate
 * "activation" step.
 */
@Injectable()
export class ApproveProviderPrescriptionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(prescriptionId: string, expectedVersion: number, actor: AccessTokenPayload): Promise<ApproveProviderPrescriptionResult> {
    if (actor.contextType !== RoleContextType.DOCTOR) {
      throw new ForbiddenError();
    }

    const scope = await this.doctorScope.execute(actor);

    return this.prisma.$transaction(async (tx) => {
      const prescription = await this.prescriptions.findById(tx, prescriptionId);
      if (!prescription || prescription.doctor_id !== scope.doctorUserId || prescription.status !== 'PENDING_DOCTOR_APPROVAL') {
        throw new NotFoundError('Prescription', prescriptionId);
      }

      await this.prescriptions.approve(tx, prescriptionId, expectedVersion, {
        decidedByUserId: actor.sub,
        decidedAt: new Date(),
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'prescriptions.prescription.approve',
        resourceType: 'prescription',
        resourceId: prescriptionId,
        subjectPatientId: prescription.patient_id,
      });

      await this.outbox.emit(tx, 'ProviderPrescriptionApproved', {
        prescriptionId,
        patientId: prescription.patient_id,
        approvedByUserId: actor.sub,
      });
      if (prescription.created_by_user_id !== actor.sub) {
        await this.outbox.emit(tx, 'ProviderPrescriptionStatusChanged', {
          prescriptionId,
          status: 'ACCEPTED',
          recipientUserId: prescription.created_by_user_id,
        });
      }

      return { prescriptionId, status: 'ACCEPTED' as const };
    });
  }
}
