import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';

export interface RejectProviderPrescriptionInput {
  reason: string;
  expectedVersion: number;
}

export interface RejectProviderPrescriptionResult {
  prescriptionId: string;
  status: 'REJECTED';
}

/**
 * File 12 Part 51 — `PENDING_DOCTOR_APPROVAL --> REJECTED`. Mirrors
 * `ApproveProviderPrescriptionUseCase`'s authorization exactly (`DOCTOR`-only,
 * must be the named supervising doctor, existence-hiding 404 otherwise) —
 * only the terminal state and the reason-tracking differ.
 */
@Injectable()
export class RejectProviderPrescriptionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(prescriptionId: string, input: RejectProviderPrescriptionInput, actor: AccessTokenPayload): Promise<RejectProviderPrescriptionResult> {
    if (actor.contextType !== RoleContextType.DOCTOR) {
      throw new ForbiddenError();
    }

    const scope = await this.doctorScope.execute(actor);

    return this.prisma.$transaction(async (tx) => {
      const prescription = await this.prescriptions.findById(tx, prescriptionId);
      if (!prescription || prescription.doctor_id !== scope.doctorUserId || prescription.status !== 'PENDING_DOCTOR_APPROVAL') {
        throw new NotFoundError('Prescription', prescriptionId);
      }

      await this.prescriptions.reject(tx, prescriptionId, input.expectedVersion, {
        decidedByUserId: actor.sub,
        decidedAt: new Date(),
        rejectionReason: input.reason,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'prescriptions.prescription.reject',
        resourceType: 'prescription',
        resourceId: prescriptionId,
        subjectPatientId: prescription.patient_id,
        reasonCode: input.reason,
      });

      await this.outbox.emit(tx, 'ProviderPrescriptionRejected', {
        prescriptionId,
        patientId: prescription.patient_id,
        createdByUserId: prescription.created_by_user_id,
        rejectedByUserId: actor.sub,
        reason: input.reason,
      });

      return { prescriptionId, status: 'REJECTED' as const };
    });
  }
}
