import { Inject, Injectable } from '@nestjs/common';
import { Prisma, RoleContextType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AssertPatientInDoctorScopeUseCase } from '../../scheduling-appointments/application/assert-patient-in-doctor-scope.use-case';
import { GetDoctorAppointmentUseCase } from '../../scheduling-appointments/application/get-doctor-appointment.use-case';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { ListStaffByContextUseCase } from '../../identity-auth/application/list-staff-by-context.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { GetPrescriptionSummaryUseCase } from '../../prescriptions/application/get-prescription-summary.use-case';
import { encodeCustodyAction } from '../domain/custody-action.util';
import { LabBranchRepository } from '../infrastructure/lab-branch.repository';
import { LabOrderRepository } from '../infrastructure/lab-order.repository';

const ASSISTANT_PERMISSION = 'lab-orders:create:assistant';

export interface CreateProviderLabOrderInput {
  patientId: string;
  labBranchId: string;
  collectionType: 'VISIT' | 'HOME_COLLECTION';
  prescriptionId: string;
  appointmentId?: string;
}

export interface CreateProviderLabOrderResult {
  labOrderId: string;
  status: 'REQUESTED';
}

export interface CreateProviderLabOrderBatchResult {
  batchId: string;
  results: Array<CreateProviderLabOrderResult & { patientId: string }>;
}

/**
 * File 12 Part 51 — provider clinical requests, Phase 1 domain foundation.
 * Unlike `Prescription` (which has a `PENDING_DOCTOR_APPROVAL` sign-off
 * gate), the prompt's conservative rule for lab requests is authorization
 * only — no doctor countersignature step — so both `DOCTOR` and an
 * authorized `CLINIC_STAFF` (gated by the `lab-orders:create:assistant`
 * role-wide permission) create straight into `REQUESTED`, landing in the
 * same `LabBranch` queue `ListLabOrdersUseCase`/`GET /lab-orders` already
 * serve. Origin is derived as `doctor_id IS NOT NULL` — `LabOrder` has no
 * `source`-style column to mirror `Prescription`'s.
 *
 * `LabOrder.lab_branch_id` is `NOT NULL` (unlike `PharmacyOrder`, which
 * broadcasts to several candidate branches) — a provider caller must name
 * one branch directly, exactly like `CreateLabOrderUseCase`'s existing
 * patient-facing flow. No default/nearest-branch invention here.
 */
@Injectable()
export class CreateProviderLabOrderUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LabOrderRepository) private readonly labOrders: LabOrderRepository,
    @Inject(LabBranchRepository) private readonly labBranches: LabBranchRepository,
    @Inject(GetPrescriptionSummaryUseCase) private readonly getPrescriptionSummary: GetPrescriptionSummaryUseCase,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(AssertPatientInDoctorScopeUseCase) private readonly patientAccess: AssertPatientInDoctorScopeUseCase,
    @Inject(GetDoctorAppointmentUseCase) private readonly getDoctorAppointment: GetDoctorAppointmentUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ListStaffByContextUseCase) private readonly listStaffByContext: ListStaffByContextUseCase,
  ) {}

  async execute(input: CreateProviderLabOrderInput, actor: AccessTokenPayload): Promise<CreateProviderLabOrderResult> {
    const scope = await this.authorize(actor);
    await this.validateInput(input, actor, scope.affiliationIds);

    return this.prisma.$transaction((tx) => this.createInTransaction(tx, input, actor, scope.doctorUserId));
  }

  /**
   * Atomic batch counterpart to `execute`. It deliberately loops over
   * independent patient inputs; `batch_id` only lets a provider regroup the
   * resulting LabOrders and never creates a shared request or access scope.
   */
  async executeBatch(inputs: CreateProviderLabOrderInput[], actor: AccessTokenPayload): Promise<CreateProviderLabOrderBatchResult> {
    if (inputs.length === 0) {
      throw new BusinessRuleError('BATCH_NEEDS_REQUESTS', 'أضف طلب مريض واحد على الأقل إلى الدفعة.');
    }
    this.assertDistinctPatients(inputs);

    const scope = await this.authorize(actor);
    const validated: CreateProviderLabOrderInput[] = [];
    for (const input of inputs) {
      await this.validateInput(input, actor, scope.affiliationIds);
      validated.push(input);
    }

    const batchId = randomUUID();
    const results = await this.prisma.$transaction(async (tx) => {
      const created: Array<CreateProviderLabOrderResult & { patientId: string }> = [];
      for (const input of validated) {
        const result = await this.createInTransaction(tx, input, actor, scope.doctorUserId, batchId);
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
      throw new ForbiddenError('ROLE_NOT_PERMITTED', 'ليس لديك صلاحية طلب تحاليل نيابةً عن الطبيب.');
    }

    return this.doctorScope.execute(actor);
  }

  private async validateInput(input: CreateProviderLabOrderInput, actor: AccessTokenPayload, affiliationIds: string[]): Promise<void> {
    if (!input.prescriptionId) {
      throw new BusinessRuleError('LAB_ORDER_REFERRAL_REQUIRED', 'أرفق إحالة معملية لطلب التحاليل.');
    }

    await this.patientAccess.execute(input.patientId, affiliationIds);

    const prescription = await this.getPrescriptionSummary.execute(this.prisma, input.prescriptionId);
    if (
      !prescription ||
      prescription.patientId !== input.patientId ||
      (prescription.source === 'DOCTOR_ISSUED' && prescription.documentType !== 'LAB_REFERRAL')
    ) {
      throw new NotFoundError('Prescription', input.prescriptionId);
    }

    if (input.appointmentId) {
      const appointment = await this.getDoctorAppointment.execute(input.appointmentId, actor);
      if (appointment.patientId !== input.patientId) {
        throw new BusinessRuleError('APPOINTMENT_PATIENT_MISMATCH', 'هذا الموعد لا يخص هذا المريض.');
      }
    }

    const branch = await this.labBranches.findById(this.prisma, input.labBranchId);
    if (!branch || branch.status !== 'VERIFIED') {
      throw new NotFoundError('LabBranch', input.labBranchId);
    }
    if (input.collectionType === 'HOME_COLLECTION' && !branch.home_collection_capable) {
      throw new BusinessRuleError('LAB_BRANCH_NOT_HOME_COLLECTION_CAPABLE', 'فرع المعمل المختار لا يوفّر سحب العيّنة من المنزل.');
    }

  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateProviderLabOrderInput,
    actor: AccessTokenPayload,
    doctorUserId: string,
    batchId?: string,
  ): Promise<CreateProviderLabOrderResult> {
    const order = await this.labOrders.create(tx, {
        patientId: input.patientId,
        labBranchId: input.labBranchId,
        prescriptionId: input.prescriptionId,
        collectionType: input.collectionType,
      doctorId: doctorUserId,
        createdByUserId: actor.sub,
        appointmentId: input.appointmentId,
      batchId,
    });

      // Same `REQUEST_RECEIVED` custody stage the patient-facing
      // `CreateLabOrderUseCase` writes — this vocabulary is a closed set
      // copied verbatim from the dashboard's own contract (see
      // `custody-action.util.ts`), not a place to encode origin. Who created
      // it is already on the row (`actor_user_id`, and `LabOrder.doctor_id`/
      // `created_by_user_id`), not the action string.
    await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: encodeCustodyAction('REQUEST_RECEIVED'),
        resourceType: 'lab_order',
        resourceId: order.id,
        subjectPatientId: input.patientId,
    });

      // One event per LAB_STAFF member at this branch — same fan-out `CreateLabOrderUseCase` already uses.
    const labStaff = await this.listStaffByContext.execute({
        roleCode: 'LAB_STAFF',
        contextType: RoleContextType.LAB_STAFF,
        contextId: input.labBranchId,
    });
    for (const staff of labStaff) {
      await this.outbox.emit(tx, 'NewLabOrderForStaff', {
        labOrderId: order.id,
        labStaffUserId: staff.userId,
      });
    }

    await this.outbox.emit(tx, 'ProviderLabOrderCreated', {
        labOrderId: order.id,
        patientId: input.patientId,
      doctorUserId,
        createdByUserId: actor.sub,
    });

    return { labOrderId: order.id, status: 'REQUESTED' as const };
  }

  private assertDistinctPatients(inputs: CreateProviderLabOrderInput[]): void {
    const patientIds = new Set(inputs.map((input) => input.patientId));
    if (patientIds.size !== inputs.length) {
      throw new BusinessRuleError('DUPLICATE_BATCH_PATIENT', 'لا يمكن إضافة المريض نفسه أكثر من مرة في نفس الدفعة.');
    }
  }
}
