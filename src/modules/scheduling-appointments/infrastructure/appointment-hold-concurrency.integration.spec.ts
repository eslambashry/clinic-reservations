import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentRepository } from './appointment.repository';
import { AppointmentHoldRepository } from './appointment-hold.repository';
import { AppointmentSlotRepository } from './appointment-slot.repository';
import { CancelAppointmentUseCase } from '../application/cancel-appointment.use-case';
import { ConfirmAppointmentUseCase } from '../application/confirm-appointment.use-case';
import { CreateHoldUseCase } from '../application/create-hold.use-case';
import { GetAppointmentUseCase } from '../application/get-appointment.use-case';
import { ListAppointmentsUseCase } from '../application/list-appointments.use-case';
import { RescheduleAppointmentUseCase } from '../application/reschedule-appointment.use-case';
import { UpdateAppointmentVisitStatusUseCase } from '../application/update-appointment-visit-status.use-case';
import { ResolveAppointmentPaymentAmountUseCase } from '../application/resolve-appointment-payment-amount.use-case';
import { ResolveAppointmentScopeUseCase } from '../application/resolve-appointment-scope.use-case';
import { AuditService } from '../../audit/application/audit.service';
import { AuditLogRepository } from '../../audit/infrastructure/audit-log.repository';
import { CaptureInternalWalletPaymentUseCase } from '../../payments/application/capture-internal-wallet-payment.use-case';
import { CapturePayAtClinicPaymentUseCase } from '../../payments/application/capture-pay-at-clinic-payment.use-case';
import { ProcessCancellationRefundUseCase } from '../../payments/application/process-cancellation-refund.use-case';
import { PaymentIntentRepository } from '../../payments/infrastructure/payment-intent.repository';
import { PaymentSplitRepository } from '../../payments/infrastructure/payment-split.repository';
import { ProviderLedgerRepository } from '../../payments/infrastructure/provider-ledger.repository';
import { RefundRepository } from '../../payments/infrastructure/refund.repository';
import { WalletRepository } from '../../payments/infrastructure/wallet.repository';
import { WalletTransactionRepository } from '../../payments/infrastructure/wallet-transaction.repository';
import { GetAffiliationBillingInfoUseCase } from '../../provider-directory/application/get-affiliation-billing-info.use-case';
import { ListAssistantUserIdsForBranchUseCase } from '../../provider-directory/application/list-assistant-user-ids-for-branch.use-case';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AffiliationRepository } from '../../provider-directory/infrastructure/affiliation.repository';
import { ClinicStaffAssignmentRepository } from '../../provider-directory/infrastructure/clinic-staff-assignment.repository';
import { DoctorRepository } from '../../provider-directory/infrastructure/doctor.repository';
import { AppConfigModule } from '../../../shared/config/config.module';
import { RequestContextService } from '../../../shared/core/context/request-context.service';
import { ConflictError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PolicyConfigReader } from '../../../shared/kernel/policy-config/policy-config.reader';
import { PrismaModule } from '../../../shared/kernel/prisma/prisma.module';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';

dotenv.config();

/**
 * File 11 Part 26 "N simultaneous holds, one wins" / File 12 Part 35.2's
 * explicit exit criterion — runs the full hold/confirm/cancel/reschedule
 * booking loop end to end against a real Postgres (including the
 * concurrency races, N patients/confirms racing at once). Scoped to exactly
 * the providers these use-cases need (same rationale as `GenerateSlotsUseCase
 * (integration)`), not the full module graph.
 */
describe('Appointment booking loop (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let createHold: CreateHoldUseCase;
  let confirmAppointment: ConfirmAppointmentUseCase;
  let cancelAppointment: CancelAppointmentUseCase;
  let rescheduleAppointment: RescheduleAppointmentUseCase;
  let listAppointments: ListAppointmentsUseCase;
  let getAppointment: GetAppointmentUseCase;
  let updateVisitStatus: UpdateAppointmentVisitStatusUseCase;

  const suffix = randomUUID().slice(0, 8);
  // `specialties.code` is a UUID; the suffix above still names the other fixtures.
  const specialtyCode = randomUUID();
  const CONCURRENT_PATIENTS = 5;

  let clinicId: string;
  let branchId: string;
  let addressId: string;
  let doctorId: string;
  let affiliationId: string;
  const patientUserIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule],
      providers: [
        AppointmentSlotRepository,
        AppointmentHoldRepository,
        AppointmentRepository,
        AuditLogRepository,
        AuditService,
        RequestContextService,
        OutboxService,
        PolicyConfigReader,
        AffiliationRepository,
        ClinicStaffAssignmentRepository,
        DoctorRepository,
        GetAffiliationBillingInfoUseCase,
        ListAssistantUserIdsForBranchUseCase,
        // File 12 Part 49.7: cancel/reschedule now resolve ownership through
        // this instead of hard-coding `patient_id === actor.sub`.
        ResolveDoctorScopeUseCase,
        ResolveAppointmentScopeUseCase,
        ResolveAppointmentPaymentAmountUseCase,
        PaymentIntentRepository,
        PaymentSplitRepository,
        RefundRepository,
        ProviderLedgerRepository,
        WalletRepository,
        WalletTransactionRepository,
        CapturePayAtClinicPaymentUseCase,
        CaptureInternalWalletPaymentUseCase,
        ProcessCancellationRefundUseCase,
        CreateHoldUseCase,
        ConfirmAppointmentUseCase,
        CancelAppointmentUseCase,
        RescheduleAppointmentUseCase,
        ListAppointmentsUseCase,
        GetAppointmentUseCase,
        UpdateAppointmentVisitStatusUseCase,
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    createHold = moduleRef.get(CreateHoldUseCase);
    confirmAppointment = moduleRef.get(ConfirmAppointmentUseCase);
    cancelAppointment = moduleRef.get(CancelAppointmentUseCase);
    rescheduleAppointment = moduleRef.get(RescheduleAppointmentUseCase);
    listAppointments = moduleRef.get(ListAppointmentsUseCase);
    getAppointment = moduleRef.get(GetAppointmentUseCase);
    updateVisitStatus = moduleRef.get(UpdateAppointmentVisitStatusUseCase);

    await prisma.specialty.create({ data: { code: specialtyCode, name_ar: 'تخصص اختبار' } });

    const clinic = await prisma.clinic.create({ data: { legal_name: `Test Clinic ${suffix}`, brand_name: `Test Clinic ${suffix}`, status: 'VERIFIED' } });
    clinicId = clinic.id;

    const address = await prisma.address.create({ data: { line1: 'Test St', city: 'Cairo', region_code: 'CAI', country_code: 'EG' } });
    addressId = address.id;

    const branch = await prisma.clinicBranch.create({
      data: { clinic_id: clinicId, address_id: addressId, phone: '+201', iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    });
    branchId = branch.id;

    const doctorUser = await prisma.user.create({ data: { phone: `+2010${suffix}0`, first_name: 'Doctor', last_name: 'Test' } });
    const doctor = await prisma.doctor.create({
      data: { user_id: doctorUser.id, specialty_code: specialtyCode, license_number: `LIC-${randomUUID()}`, status: 'VERIFIED' },
    });
    doctorId = doctor.id;
    patientUserIds.push(doctorUser.id);

    const affiliation = await prisma.doctorClinicAffiliation.create({
      data: { doctor_id: doctorId, clinic_branch_id: branchId, consult_fee: '100.00', currency: 'EGP' },
    });
    affiliationId = affiliation.id;

    for (let i = 0; i < CONCURRENT_PATIENTS; i++) {
      const patient = await prisma.user.create({ data: { phone: `+2011${suffix}${i}`, first_name: `Patient${i}`, last_name: 'Test' } });
      patientUserIds.push(patient.id);
    }
  }, 30000);

  afterAll(async () => {
    // Pay-at-clinic confirms now capture a real PaymentIntent (File 12 Part
    // 36) — collect the ids before the Appointment rows referencing them
    // are deleted, so the payments-side rows don't leak into the live DB.
    const appointmentsToClean = await prisma.appointment.findMany({
      where: { doctor_clinic_affiliation_id: affiliationId },
      select: { payment_intent_id: true },
    });
    const paymentIntentIds = appointmentsToClean.map((a) => a.payment_intent_id).filter((id): id is string => id !== null);

    await prisma.appointment.deleteMany({ where: { doctor_clinic_affiliation_id: affiliationId } });
    await prisma.appointmentHold.deleteMany({ where: { slot: { doctor_clinic_affiliation_id: affiliationId } } });
    await prisma.appointmentSlot.deleteMany({ where: { doctor_clinic_affiliation_id: affiliationId } });
    if (paymentIntentIds.length > 0) {
      await prisma.refund.deleteMany({ where: { payment_intent_id: { in: paymentIntentIds } } });
      await prisma.paymentSplit.deleteMany({ where: { payment_intent_id: { in: paymentIntentIds } } });
      await prisma.providerLedgerEntry.deleteMany({ where: { related_payment_intent_id: { in: paymentIntentIds } } });
      await prisma.paymentIntent.deleteMany({ where: { id: { in: paymentIntentIds } } });
    }
    await prisma.outboxEvent.deleteMany({
      where: { event_name: { in: ['AppointmentHeld', 'AppointmentConfirmed', 'AppointmentCancelled', 'PaymentCaptured', 'RefundIssued'] } },
    });
    await prisma.auditLog.deleteMany({ where: { resource_type: { in: ['appointment_hold', 'appointment'] } } });
    await prisma.doctorClinicAffiliation.delete({ where: { id: affiliationId } });
    await prisma.doctor.delete({ where: { id: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: patientUserIds } } });
    await prisma.clinicBranch.delete({ where: { id: branchId } });
    await prisma.clinic.delete({ where: { id: clinicId } });
    await prisma.address.delete({ where: { id: addressId } });
    await prisma.specialty.delete({ where: { code: specialtyCode } });
    await moduleRef.close();
  }, 20000);

  // Booking-loop slots sit a year ahead of the run date so the patient
  // start-time cutoff (PM-APPT-01) never ages these fixtures out.
  const nextYear = new Date().getUTCFullYear() + 1;
  const ahead = (month: number, day: number, hour: number) => new Date(Date.UTC(nextYear, month - 1, day, hour));

  async function freshOpenSlot(startAt: Date) {
    return prisma.appointmentSlot.create({
      data: { doctor_clinic_affiliation_id: affiliationId, start_at: startAt, end_at: new Date(startAt.getTime() + 20 * 60 * 1000), status: 'OPEN' },
    });
  }

  it('lets exactly one of N simultaneous holds on the same slot succeed', async () => {
    const slot = await freshOpenSlot(ahead(9, 1, 9));
    const patients = patientUserIds.slice(1); // exclude the doctor's own user row

    const outcomes = await Promise.allSettled(
      patients.map((patientId) =>
        createHold.execute(
          { doctorClinicAffiliationId: affiliationId, slotId: slot.id, patientId },
          { sub: patientId, roleMembershipId: randomUUID(), roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any,
        ),
      ),
    );

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(patients.length - 1);
    for (const outcome of rejected) {
      expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    }

    const holds = await prisma.appointmentHold.findMany({ where: { slot_id: slot.id } });
    expect(holds).toHaveLength(1);
    expect(holds[0].status).toBe('ACTIVE');

    const refreshedSlot = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshedSlot.status).toBe('HELD');
  });

  it('lets exactly one of N simultaneous confirms on the same hold succeed', async () => {
    const slot = await freshOpenSlot(ahead(9, 1, 10));
    const patientId = patientUserIds[1];
    const actor = { sub: patientId, roleMembershipId: randomUUID(), roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;

    const hold = await createHold.execute({ doctorClinicAffiliationId: affiliationId, slotId: slot.id, patientId }, actor);

    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, () => confirmAppointment.execute(hold.holdId, { paymentMethod: 'PAY_AT_CLINIC' }, actor)),
    );

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const appointments = await prisma.appointment.findMany({ where: { slot_id: slot.id } });
    expect(appointments).toHaveLength(1);
    expect(appointments[0].status).toBe('CONFIRMED');
  }, 20000);

  it('cancels a confirmed appointment and releases its slot back to OPEN', async () => {
    const slot = await freshOpenSlot(ahead(9, 1, 11));
    const patientId = patientUserIds[1];
    const actor = { sub: patientId, roleMembershipId: randomUUID(), roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;

    const hold = await createHold.execute({ doctorClinicAffiliationId: affiliationId, slotId: slot.id, patientId }, actor);
    const confirmed = await confirmAppointment.execute(hold.holdId, { paymentMethod: 'PAY_AT_CLINIC' }, actor);

    // The affiliation's consult_fee is 100.00 (beforeAll) and the seeded
    // CANCELLATION_TIER policy is 10% (src/db/seed.ts) — a real fee/refund
    // is now computed from the payment captured at confirm time (File 12
    // Part 36), no longer hardcoded 0/0.
    const result = await cancelAppointment.execute(confirmed.appointmentId, { reason: 'PATIENT_REQUEST' }, actor);
    expect(result).toEqual({ status: 'CANCELLED', refundAmount: 90, feeApplied: 10 });

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: confirmed.appointmentId } });
    expect(appointment.status).toBe('CANCELLED');
    expect(appointment.cancelled_by).toBe(patientId);

    const refreshedSlot = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(refreshedSlot.status).toBe('OPEN');
  }, 20000);

  it('reschedules a confirmed appointment in one step: new CONFIRMED appointment links back and keeps the same payment intent', async () => {
    const oldSlot = await freshOpenSlot(ahead(9, 1, 12));
    const newSlot = await freshOpenSlot(ahead(9, 1, 13));
    const patientId = patientUserIds[1];
    const actor = { sub: patientId, roleMembershipId: randomUUID(), roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;

    const hold = await createHold.execute({ doctorClinicAffiliationId: affiliationId, slotId: oldSlot.id, patientId }, actor);
    const confirmed = await confirmAppointment.execute(hold.holdId, { paymentMethod: 'PAY_AT_CLINIC' }, actor);
    const original = await prisma.appointment.findUniqueOrThrow({ where: { id: confirmed.appointmentId } });

    const rescheduled = await rescheduleAppointment.execute(confirmed.appointmentId, { newSlotId: newSlot.id }, actor);
    expect(rescheduled).toMatchObject({ slotId: newSlot.id, status: 'CONFIRMED', previousAppointmentId: confirmed.appointmentId });

    const oldAppointment = await prisma.appointment.findUniqueOrThrow({ where: { id: confirmed.appointmentId } });
    expect(oldAppointment.status).toBe('RESCHEDULED');

    const oldSlotRefreshed = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: oldSlot.id } });
    expect(oldSlotRefreshed.status).toBe('OPEN');
    const newSlotRefreshed = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: newSlot.id } });
    expect(newSlotRefreshed.status).toBe('BOOKED');

    const newAppointment = await prisma.appointment.findUniqueOrThrow({ where: { id: rescheduled.appointmentId } });
    expect(newAppointment.status).toBe('CONFIRMED');
    expect(newAppointment.rescheduled_from_appointment_id).toBe(confirmed.appointmentId);
    // No second charge: the replacement points at the original payment intent.
    expect(newAppointment.payment_intent_id).toBe(original.payment_intent_id);
  }, 20000);

  it('lists and gets the caller\'s own confirmed appointments, cursor-paginated by slot start_at', async () => {
    const patientId = patientUserIds[2];
    const actor = { sub: patientId, roleMembershipId: randomUUID(), roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;

    const slotA = await freshOpenSlot(ahead(9, 2, 9));
    const slotB = await freshOpenSlot(ahead(9, 2, 10));
    const holdA = await createHold.execute({ doctorClinicAffiliationId: affiliationId, slotId: slotA.id, patientId }, actor);
    const confirmedA = await confirmAppointment.execute(holdA.holdId, { paymentMethod: 'PAY_AT_CLINIC' }, actor);
    const holdB = await createHold.execute({ doctorClinicAffiliationId: affiliationId, slotId: slotB.id, patientId }, actor);
    const confirmedB = await confirmAppointment.execute(holdB.holdId, { paymentMethod: 'PAY_AT_CLINIC' }, actor);

    const firstPage = await listAppointments.execute({ limit: 1 }, actor);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0].appointmentId).toBe(confirmedA.appointmentId);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listAppointments.execute({ limit: 1, cursor: firstPage.nextCursor! }, actor);
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0].appointmentId).toBe(confirmedB.appointmentId);
    expect(secondPage.nextCursor).toBeNull();

    const otherPatientId = patientUserIds[3];
    const otherActor = { sub: otherPatientId, roleMembershipId: randomUUID(), roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
    await expect(getAppointment.execute(confirmedA.appointmentId, otherActor)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

    const detail = await getAppointment.execute(confirmedA.appointmentId, actor);
    expect(detail).toMatchObject({ appointmentId: confirmedA.appointmentId, status: 'CONFIRMED', slotId: slotA.id });
  }, 20000);

  /**
   * Approved V1 lifecycle rules (PM-APPT-01..05) against real Postgres. The
   * first two cases are the exact holes reproduced on 2026-10-03 (an
   * attended or past appointment cancelled for a refund, or rescheduled into
   * a free new visit); they must now be rejected with nothing written.
   */
  describe('approved V1 lifecycle rules', () => {
    const patientActor = (patientId: string) =>
      ({ sub: patientId, roleMembershipId: randomUUID(), roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] }) as any;
    const doctorActor = () =>
      ({ sub: patientUserIds[0], roleMembershipId: randomUUID(), roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] }) as any;

    /** Books through the real use-cases on a future slot, then moves the slot to `startAt`. */
    async function bookedAt(patientId: string, startAt: Date, hourOffset: number) {
      const slot = await freshOpenSlot(ahead(10, 1, hourOffset));
      const actor = patientActor(patientId);
      const hold = await createHold.execute({ doctorClinicAffiliationId: affiliationId, slotId: slot.id, patientId }, actor);
      const confirmed = await confirmAppointment.execute(hold.holdId, { paymentMethod: 'PAY_AT_CLINIC' }, actor);
      await prisma.appointmentSlot.update({
        where: { id: slot.id },
        data: { start_at: startAt, end_at: new Date(startAt.getTime() + 20 * 60 * 1000) },
      });
      return { appointmentId: confirmed.appointmentId, slotId: slot.id, actor };
    }

    async function snapshot(appointmentId: string) {
      const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
      const refunds = await prisma.refund.count({ where: { payment_intent_id: appointment.payment_intent_id ?? '' } });
      return { appointment, refunds };
    }

    it('rejects a patient cancelling last month\'s attended (LEFT) appointment — no refund, nothing written', async () => {
      const booked = await bookedAt(patientUserIds[4], new Date(Date.now() - 30 * 24 * 3600_000), 8);
      await prisma.appointment.update({ where: { id: booked.appointmentId }, data: { visit_status: 'LEFT' } });
      const before = await snapshot(booked.appointmentId);

      await expect(cancelAppointment.execute(booked.appointmentId, { reason: 'PATIENT_REQUEST' }, booked.actor)).rejects.toMatchObject({
        code: 'APPOINTMENT_VISIT_IN_PROGRESS',
      });
      expect(await snapshot(booked.appointmentId)).toEqual(before);
    }, 20000);

    it('rejects a patient rescheduling an attended past appointment into a free new visit', async () => {
      const booked = await bookedAt(patientUserIds[4], new Date(Date.now() - 30 * 24 * 3600_000), 9);
      await prisma.appointment.update({ where: { id: booked.appointmentId }, data: { visit_status: 'LEFT' } });
      const target = await freshOpenSlot(ahead(11, 1, 9));

      await expect(rescheduleAppointment.execute(booked.appointmentId, { newSlotId: target.id }, booked.actor)).rejects.toMatchObject({
        code: 'APPOINTMENT_VISIT_IN_PROGRESS',
      });
      expect((await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('OPEN');
      expect(await prisma.appointment.count({ where: { rescheduled_from_appointment_id: booked.appointmentId } })).toBe(0);
    }, 20000);

    it('rejects a patient cancel or reschedule once start_at has passed, even if the patient never arrived', async () => {
      const booked = await bookedAt(patientUserIds[4], new Date(Date.now() - 60_000), 10);
      const before = await snapshot(booked.appointmentId);
      const target = await freshOpenSlot(ahead(11, 1, 10));

      await expect(cancelAppointment.execute(booked.appointmentId, { reason: 'PATIENT_REQUEST' }, booked.actor)).rejects.toMatchObject({
        code: 'APPOINTMENT_CHANGE_WINDOW_CLOSED',
      });
      await expect(rescheduleAppointment.execute(booked.appointmentId, { newSlotId: target.id }, booked.actor)).rejects.toMatchObject({
        code: 'APPOINTMENT_CHANGE_WINDOW_CLOSED',
      });
      expect(await snapshot(booked.appointmentId)).toEqual(before);
    }, 20000);

    it('the repository WHERE alone refuses a cancel once the visit has started (race between check and write)', async () => {
      const booked = await bookedAt(patientUserIds[4], ahead(10, 2, 9), 11);
      const row = await prisma.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } });
      // Simulates a visit start that landed after the use-case's read but
      // before its write: same version, but the patient is now in the room.
      await prisma.$executeRaw`UPDATE appointments SET visit_status = 'IN_DOCTOR_ROOM' WHERE id = ${row.id}::uuid`;

      const repo = new AppointmentRepository();
      await expect(repo.cancel(prisma, row.id, row.version, booked.actor.sub, 'PATIENT_REQUEST', new Date())).resolves.toBe(false);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('CONFIRMED');
    }, 20000);

    it('completes the appointment atomically when the doctor records LEFT on the appointment day', async () => {
      const booked = await bookedAt(patientUserIds[5], new Date(), 12);
      const first = await prisma.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } });

      const inRoom = await updateVisitStatus.execute(booked.appointmentId, { status: 'IN_DOCTOR_ROOM', version: first.version }, doctorActor());
      expect(inRoom).toMatchObject({ status: 'CONFIRMED', visitStatus: 'IN_DOCTOR_ROOM' });
      const left = await updateVisitStatus.execute(booked.appointmentId, { status: 'LEFT', version: inRoom.version }, doctorActor());
      expect(left).toMatchObject({ status: 'COMPLETED', visitStatus: 'LEFT' });

      // A completed appointment is no longer cancellable by anyone.
      await expect(cancelAppointment.execute(booked.appointmentId, { reason: 'PROVIDER_REQUEST' }, doctorActor())).rejects.toMatchObject({
        code: 'APPOINTMENT_NOT_CANCELLABLE',
      });
    }, 20000);

    it('refuses to start a visit for an appointment on another local day', async () => {
      const booked = await bookedAt(patientUserIds[5], new Date(Date.now() + 3 * 24 * 3600_000), 13);
      const row = await prisma.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } });

      await expect(
        updateVisitStatus.execute(booked.appointmentId, { status: 'IN_DOCTOR_ROOM', version: row.version }, doctorActor()),
      ).rejects.toMatchObject({ code: 'VISIT_STATUS_OUTSIDE_APPOINTMENT_DAY' });
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: row.id } })).visit_status).toBe('WAITING');
    }, 20000);

    it('turns an unattended expired CONFIRMED visit into NO_SHOW without moving any money', async () => {
      const booked = await bookedAt(patientUserIds[5], new Date(Date.now() - 3 * 3600_000), 14);
      const rescheduledAway = await bookedAt(patientUserIds[5], new Date(Date.now() - 3 * 3600_000 + 30 * 60_000), 15);
      await prisma.appointment.update({ where: { id: rescheduledAway.appointmentId }, data: { status: 'RESCHEDULED' } });
      const before = await snapshot(booked.appointmentId);
      const intentBefore = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: before.appointment.payment_intent_id! } });
      const walletTxBefore = await prisma.walletTransaction.count();

      await prisma.$transaction((tx) => new AppointmentRepository().expireWaitingVisits(tx, 30));

      const after = await snapshot(booked.appointmentId);
      expect(after.appointment).toMatchObject({ status: 'NO_SHOW', visit_status: 'TIME_EXPIRED', payment_intent_id: before.appointment.payment_intent_id });
      expect(after.refunds).toBe(before.refunds);
      expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentBefore.id } })).toEqual(intentBefore);
      expect(await prisma.walletTransaction.count()).toBe(walletTxBefore);
      // TIME_EXPIRED on an already-finished row is reconciliation, not a no-show.
      expect(await prisma.appointment.findUniqueOrThrow({ where: { id: rescheduledAway.appointmentId } })).toMatchObject({
        status: 'RESCHEDULED',
        visit_status: 'TIME_EXPIRED',
      });
    }, 20000);
  });
});
