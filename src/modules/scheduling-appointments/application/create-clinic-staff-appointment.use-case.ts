import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { GetUserSummaryUseCase } from '../../identity-auth/application/get-user-summary.use-case';
import { RoleMembershipRepository } from '../../identity-auth/infrastructure/role-membership.repository';
import { UserRepository } from '../../identity-auth/infrastructure/user.repository';
import { CapturePayAtClinicPaymentUseCase } from '../../payments/application/capture-pay-at-clinic-payment.use-case';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { AppointmentSlotRepository } from '../infrastructure/appointment-slot.repository';

const PATIENT_ROLE_CODE = 'PATIENT';

export interface CreateClinicStaffAppointmentInput {
  clinicBranchId: string;
  patientId?: string;
  patientPhone?: string;
  patientName?: string;
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
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
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
      let patientId: string;

      if (input.patientPhone) {
        // Find-or-create by phone, mirroring `VerifyOtpUseCase`'s
        // self-registration path exactly: reuse an existing user (never
        // overwrite their name) or create one plus a PATIENT role_membership.
        let user = await this.userRepository.findByPhone(tx, input.patientPhone);
        if (!user) {
          user = await this.userRepository.create(tx, input.patientPhone, input.patientName);
        }

        let memberships = await this.roleMemberships.findActiveByUser(tx, user.id);
        if (memberships.length === 0) {
          const membership = await this.roleMemberships.create(tx, {
            userId: user.id,
            roleCode: PATIENT_ROLE_CODE,
            contextType: RoleContextType.PATIENT,
          });
          memberships = [membership];
        }

        patientId = user.id;
      } else {
        const patient = await this.users.execute(tx, input.patientId!);
        if (!patient) {
          throw new NotFoundError('Patient', input.patientId!);
        }
        patientId = input.patientId!;
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
        payerUserId: patientId,
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
        patientId,
        doctorClinicAffiliationId: affiliation.affiliationId,
        paymentIntentId: billing.paymentIntentId,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'scheduling_appointments.appointment.create_by_clinic_staff',
        resourceType: 'appointment',
        resourceId: appointment.id,
        subjectPatientId: patientId,
      });
      await this.outbox.emit(tx, 'AppointmentConfirmed', {
        appointmentId: appointment.id,
        slotId: slot.id,
        patientId,
        createdBy: 'CLINIC_STAFF',
      });

      return { appointmentId: appointment.id, status: 'CONFIRMED' as const };
    }, { timeout: 15000 });
  }
}