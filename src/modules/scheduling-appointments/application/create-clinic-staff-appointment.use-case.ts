import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { GetUserSummaryUseCase } from '../../identity-auth/application/get-user-summary.use-case';
import { CapturePayAtClinicPaymentUseCase } from '../../payments/application/capture-pay-at-clinic-payment.use-case';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

export interface CreateClinicStaffAppointmentInput {
  clinicBranchId: string;
  patientId: string;
  slotId: string;
}

export interface CreateClinicStaffAppointmentResult {
  appointmentId: string;
  status: 'CONFIRMED';
}

@Injectable()
export class CreateClinicStaffAppointmentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(GetUserSummaryUseCase) private readonly users: GetUserSummaryUseCase,
    @Inject(AppointmentSlotRepository) private readonly slots: AppointmentSlotRepository,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
    @Inject(CapturePayAtClinicPaymentUseCase) private readonly paymentsCapture: CapturePayAtClinicPaymentUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(input: CreateClinicStaffAppointmentInput, actor: AccessTokenPayload): Promise<CreateClinicStaffAppointmentResult> {
    const scope = await this.doctorScope.execute(actor);
    const affiliation = scope.affiliations.find((item) => item.clinicBranchId === input.clinicBranchId);
    if (!affiliation) {
      throw new NotFoundError('ClinicBranch', input.clinicBranchId);
    }

    return this.prisma.$transaction(async (tx) => {
      const patient = await this.users.execute(tx, input.patientId);
      if (!patient) {
        throw new NotFoundError('Patient', input.patientId);
      }

      const slot = await this.slots.findById(tx, input.slotId);
      if (!slot || slot.doctor_clinic_affiliation_id !== affiliation.affiliationId) {
        throw new NotFoundError('AppointmentSlot', input.slotId);
      }
      if (slot.status !== 'OPEN') {
        throw new ConflictError('SLOT_ALREADY_BOOKED', 'لم يعد هذا الموعد متاحًا. اختر موعدًا آخر.', { slotId: slot.id });
      }

      const claimed = await this.slots.markBooked(tx, slot.id);
      if (!claimed) {
        throw new ConflictError('SLOT_ALREADY_BOOKED', 'لم يعد هذا الموعد متاحًا. اختر موعدًا آخر.', { slotId: slot.id });
      }

      const appointmentId = randomUUID();
      const billing = await this.paymentsCapture.execute(tx, {
        payerUserId: input.patientId,
        payableType: 'APPOINTMENT',
        payableId: appointmentId,
        amount: affiliation.consultFee,
        currency: affiliation.currency,
        providerType: 'DOCTOR',
        providerId: scope.doctorId,
        idempotencyKey: `clinic-staff:${appointmentId}`,
      });

      const appointment = await this.appointments.create(tx, {
        id: appointmentId,
        slotId: slot.id,
        patientId: input.patientId,
        doctorClinicAffiliationId: affiliation.affiliationId,
        paymentIntentId: billing.paymentIntentId,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.appointment.create_by_clinic_staff',
        resourceType: 'appointment',
        resourceId: appointment.id,
        subjectPatientId: input.patientId,
      });
      await this.outbox.emit(tx, 'AppointmentConfirmed', {
        appointmentId: appointment.id,
        slotId: slot.id,
        patientId: input.patientId,
        createdBy: 'CLINIC_STAFF',
      });

      return { appointmentId: appointment.id, status: 'CONFIRMED' as const };
    }, { timeout: 15000 });
  }
}