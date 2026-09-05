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
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AffiliationRepository } from '../../provider-directory/infrastructure/affiliation.repository';
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

  const suffix = randomUUID().slice(0, 8);
  const specialtyCode = `TEST_SPECIALTY_HOLD_${suffix}`;
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
        DoctorRepository,
        GetAffiliationBillingInfoUseCase,
        // File 12 Part 49.7: cancel/reschedule now resolve ownership through
        // this instead of hard-coding `patient_id === actor.sub`.
        ResolveDoctorScopeUseCase,
        ResolveAppointmentScopeUseCase,
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

    await prisma.specialty.create({ data: { code: specialtyCode, name_en: 'Test Specialty', name_ar: 'تخصص اختبار' } });

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

  async function freshOpenSlot(startAt: Date) {
    return prisma.appointmentSlot.create({
      data: { doctor_clinic_affiliation_id: affiliationId, start_at: startAt, end_at: new Date(startAt.getTime() + 20 * 60 * 1000), status: 'OPEN' },
    });
  }

  it('lets exactly one of N simultaneous holds on the same slot succeed', async () => {
    const slot = await freshOpenSlot(new Date('2026-09-01T09:00:00Z'));
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
    const slot = await freshOpenSlot(new Date('2026-09-01T10:00:00Z'));
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
    const slot = await freshOpenSlot(new Date('2026-09-01T11:00:00Z'));
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

  it('reschedules a confirmed appointment to a fresh hold, then confirming it links back to the original appointment', async () => {
    const oldSlot = await freshOpenSlot(new Date('2026-09-01T12:00:00Z'));
    const newSlot = await freshOpenSlot(new Date('2026-09-01T13:00:00Z'));
    const patientId = patientUserIds[1];
    const actor = { sub: patientId, roleMembershipId: randomUUID(), roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;

    const hold = await createHold.execute({ doctorClinicAffiliationId: affiliationId, slotId: oldSlot.id, patientId }, actor);
    const confirmed = await confirmAppointment.execute(hold.holdId, { paymentMethod: 'PAY_AT_CLINIC' }, actor);

    const rescheduled = await rescheduleAppointment.execute(confirmed.appointmentId, { newSlotId: newSlot.id }, actor);
    expect(rescheduled).toMatchObject({ slotId: newSlot.id, status: 'HELD', previousAppointmentId: confirmed.appointmentId });
    // Narrows the union added in File 12 Part 49.9: a PATIENT actor always
    // gets the unconfirmed-hold arm; the CONFIRMED arm is provider-only.
    if (rescheduled.status !== 'HELD') {
      throw new Error('a patient-initiated reschedule must return an unconfirmed hold');
    }

    const oldAppointment = await prisma.appointment.findUniqueOrThrow({ where: { id: confirmed.appointmentId } });
    expect(oldAppointment.status).toBe('RESCHEDULED');

    const oldSlotRefreshed = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: oldSlot.id } });
    expect(oldSlotRefreshed.status).toBe('OPEN');
    const newSlotRefreshed = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: newSlot.id } });
    expect(newSlotRefreshed.status).toBe('HELD');

    const newlyConfirmed = await confirmAppointment.execute(rescheduled.holdId, { paymentMethod: 'PAY_AT_CLINIC' }, actor);
    const newAppointment = await prisma.appointment.findUniqueOrThrow({ where: { id: newlyConfirmed.appointmentId } });
    expect(newAppointment.rescheduled_from_appointment_id).toBe(confirmed.appointmentId);
  }, 20000);

  it('lists and gets the caller\'s own confirmed appointments, cursor-paginated by slot start_at', async () => {
    const patientId = patientUserIds[2];
    const actor = { sub: patientId, roleMembershipId: randomUUID(), roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;

    const slotA = await freshOpenSlot(new Date('2026-09-02T09:00:00Z'));
    const slotB = await freshOpenSlot(new Date('2026-09-02T10:00:00Z'));
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
});
