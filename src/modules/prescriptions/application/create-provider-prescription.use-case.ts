import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrescriptionStatus, RoleContextType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AssertPatientInDoctorScopeUseCase } from '../../scheduling-appointments/application/assert-patient-in-doctor-scope.use-case';
import { GetDoctorAppointmentUseCase } from '../../scheduling-appointments/application/get-doctor-appointment.use-case';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { OcrSuggestedItem } from './ports/ocr-extractor.port';
import { PrescriptionItemRepository } from '../infrastructure/prescription-item.repository';
import { PrescriptionRepository } from '../infrastructure/prescription.repository';

const ASSISTANT_PERMISSION = 'prescriptions:create:assistant';

export interface ProviderPrescriptionItemInput {
  drugNameFreeText: string;
  dose?: string;
  frequency?: string;
  durationDays?: number;
  quantity: number;
}

export interface CreateProviderPrescriptionInput {
  patientId: string;
  items: ProviderPrescriptionItemInput[];
  notes?: string;
  /** Optional link to the visit this was written during — must belong to the same doctor scope and patient. */
  appointmentId?: string;
}

export interface CreateProviderPrescriptionResult {
  prescriptionId: string;
  status: Extract<PrescriptionStatus, 'ACCEPTED' | 'PENDING_DOCTOR_APPROVAL'>;
}

export interface CreateProviderPrescriptionBatchResult {
  batchId: string;
  results: Array<CreateProviderPrescriptionResult & { patientId: string }>;
}

/**
 * File 12 Part 51 — provider clinical requests, Phase 1 domain foundation.
 * `DOCTOR` creates and signs in one step (`source: DOCTOR_ISSUED`,
 * `status: ACCEPTED` immediately — this is exactly the status
 * `GetAcceptedPrescriptionForOrderUseCase` already reads, so the resulting
 * row flows into the existing patient-initiated `PharmacyOrder` path
 * unchanged, no new pharmacy-side code needed). `CLINIC_STAFF` (an
 * assistant, gated by the `prescriptions:create:assistant` role-wide
 * permission) can only ever *prepare* a draft — `status:
 * PENDING_DOCTOR_APPROVAL` — which is deliberately excluded from every
 * existing `ACCEPTED`-or-`QUALITY_CHECK_PASSED` read site by construction
 * (see the enum's own doc comment in `shared.prisma`), so it cannot reach a
 * patient as an active prescription or reach Pharmacy until
 * `ApproveProviderPrescriptionUseCase` runs.
 *
 * `drug_code` is deliberately never set on the created items — the DB
 * trigger documented on `PrescriptionItem` rejects it before any
 * `prescription_reviews` row exists, and a doctor-typed row never gets one
 * (that review kind is pharmacist-specific). Items carry
 * `drug_name_free_text`/dose/frequency/duration/quantity only, the exact
 * shape `PrescriptionItemRepository.createManySuggested` already writes for
 * OCR suggestions — reused here as-is (same DB write, different origin).
 */
@Injectable()
export class CreateProviderPrescriptionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(PrescriptionItemRepository) private readonly items: PrescriptionItemRepository,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(AssertPatientInDoctorScopeUseCase) private readonly patientAccess: AssertPatientInDoctorScopeUseCase,
    @Inject(GetDoctorAppointmentUseCase) private readonly getDoctorAppointment: GetDoctorAppointmentUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(input: CreateProviderPrescriptionInput, actor: AccessTokenPayload): Promise<CreateProviderPrescriptionResult> {
    const { isAssistant, scope } = await this.authorize(actor);
    await this.validateInput(input, actor, scope.affiliationIds);

    return this.prisma.$transaction((tx) => this.createInTransaction(tx, input, actor, scope.doctorUserId, isAssistant));
  }

  /**
   * Batch creation is intentionally all-or-nothing. Each input is validated
   * against the caller's scope before the write transaction, then persisted
   * as its own Prescription (and its own future PharmacyOrder) under one
   * grouping UUID. `batch_id` is query metadata only, never an access scope.
   */
  async executeBatch(
    inputs: CreateProviderPrescriptionInput[],
    actor: AccessTokenPayload,
  ): Promise<CreateProviderPrescriptionBatchResult> {
    if (inputs.length === 0) {
      throw new BusinessRuleError('BATCH_NEEDS_REQUESTS', 'أضف طلب مريض واحد على الأقل إلى الدفعة.');
    }
    this.assertDistinctPatients(inputs);

    const { isAssistant, scope } = await this.authorize(actor);
    for (const input of inputs) {
      await this.validateInput(input, actor, scope.affiliationIds);
    }

    const batchId = randomUUID();
    const results = await this.prisma.$transaction(async (tx) => {
      const created: Array<CreateProviderPrescriptionResult & { patientId: string }> = [];
      for (const input of inputs) {
        const result = await this.createInTransaction(tx, input, actor, scope.doctorUserId, isAssistant, batchId);
        created.push({ ...result, patientId: input.patientId });
      }
      return created;
    });

    return { batchId, results };
  }

  private async authorize(actor: AccessTokenPayload) {
    if (actor.contextType !== RoleContextType.DOCTOR && actor.contextType !== RoleContextType.CLINIC_STAFF) {
      throw new ForbiddenError();
    }
    const isAssistant = actor.contextType === RoleContextType.CLINIC_STAFF;
    if (isAssistant && !actor.permissions.includes(ASSISTANT_PERMISSION)) {
      throw new ForbiddenError('ROLE_NOT_PERMITTED', 'ليس لديك صلاحية إعداد روشتات نيابةً عن الطبيب.');
    }
    const scope = await this.doctorScope.execute(actor);
    return { isAssistant, scope };
  }

  private async validateInput(input: CreateProviderPrescriptionInput, actor: AccessTokenPayload, affiliationIds: string[]): Promise<void> {
    if (input.items.length === 0) {
      throw new BusinessRuleError('PRESCRIPTION_NEEDS_ITEMS', 'أضف دواءً واحدًا على الأقل لإصدار الروشتة.');
    }
    await this.patientAccess.execute(input.patientId, affiliationIds);

    if (input.appointmentId) {
      const appointment = await this.getDoctorAppointment.execute(input.appointmentId, actor);
      if (appointment.patientId !== input.patientId) {
        throw new BusinessRuleError('APPOINTMENT_PATIENT_MISMATCH', 'هذا الموعد لا يخص هذا المريض.');
      }
    }

  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateProviderPrescriptionInput,
    actor: AccessTokenPayload,
    doctorUserId: string,
    isAssistant: boolean,
    batchId?: string,
  ): Promise<CreateProviderPrescriptionResult> {
    const status: CreateProviderPrescriptionResult['status'] = isAssistant ? 'PENDING_DOCTOR_APPROVAL' : 'ACCEPTED';
    const suggestedItems: OcrSuggestedItem[] = input.items.map((item) => ({
      drugNameFreeText: item.drugNameFreeText,
      dose: item.dose ?? null,
      frequency: item.frequency ?? null,
      durationDays: item.durationDays ?? null,
      quantity: item.quantity,
    }));

    const prescription = await this.prescriptions.create(tx, {
        patientId: input.patientId,
        source: 'DOCTOR_ISSUED',
        notes: input.notes,
        doctorId: doctorUserId,
        createdByUserId: actor.sub,
        createdByRole: actor.contextType,
        appointmentId: input.appointmentId,
        batchId,
        status,
    });

    await this.items.createManySuggested(tx, prescription.id, suggestedItems);

    await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: isAssistant ? 'prescriptions.prescription.prepare_by_assistant' : 'prescriptions.prescription.create_by_doctor',
        resourceType: 'prescription',
        resourceId: prescription.id,
        subjectPatientId: input.patientId,
    });

    await this.outbox.emit(tx, isAssistant ? 'ProviderPrescriptionPendingApproval' : 'ProviderPrescriptionCreated', {
        prescriptionId: prescription.id,
        patientId: input.patientId,
      doctorUserId,
        createdByUserId: actor.sub,
    });

    return { prescriptionId: prescription.id, status };
  }

  private assertDistinctPatients(inputs: CreateProviderPrescriptionInput[]): void {
    const patientIds = new Set(inputs.map((input) => input.patientId));
    if (patientIds.size !== inputs.length) {
      throw new BusinessRuleError('DUPLICATE_BATCH_PATIENT', 'لا يمكن إضافة المريض نفسه أكثر من مرة في نفس الدفعة.');
    }
  }
}
