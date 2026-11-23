import { Prisma } from '@prisma/client';
import { toDoctorAppointmentSummary } from './doctor-appointment.mapper';

describe('toDoctorAppointmentSummary payment', () => {
  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'appt-1',
      status: 'CONFIRMED',
      visit_status: 'WAITING',
      version: 1,
      slot_id: 'slot-1',
      slot: { start_at: new Date('2026-09-10T09:00:00Z'), end_at: new Date('2026-09-10T09:30:00Z') },
      doctor_clinic_affiliation_id: 'aff-1',
      patient: { id: 'patient-1', first_name: 'Mona', last_name: 'Hassan', phone: '+201000000009' },
      affiliation: {
        clinic_branch: {
          id: 'branch-1',
          phone: '+201000000000',
          iana_timezone: 'Africa/Cairo',
          clinic: { id: 'clinic-1', brand_name: 'Nile Clinic' },
          address: { line1: '12 Tahrir St', city: 'Cairo' },
        },
      },
      cancelled_reason: null,
      cancelled_by: null,
      rescheduled_from_appointment_id: null,
      remaining_balance: null,
      payment_intent: null,
      created_at: new Date('2026-09-01T00:00:00Z'),
      ...overrides,
    } as any;
  }

  function intent(method: string, amount: string, fullAmount: string | null) {
    return {
      method,
      amount: new Prisma.Decimal(amount),
      full_amount: fullAmount === null ? null : new Prisma.Decimal(fullAmount),
      currency: 'EGP',
    };
  }

  it('never exposes a payment object to the doctor (fee-only flow)', () => {
    const summary = toDoctorAppointmentSummary(row({ payment_intent: intent('CARD', '12', null) }));

    expect(summary).not.toHaveProperty('payment');
  });

  // DISABLED TEMPORARILY: هذه الميزة ملغاة بشكل مؤقت حاليا
  // it('exposes only the service fee paid (no consult fee, remaining balance or refund fields)', () => {
  //   const summary = toDoctorAppointmentSummary(row({ payment_intent: intent('CARD', '12', null) }));
  //   expect(summary.payment).toEqual({ method: 'CARD', currency: 'EGP', serviceFee: '12.00' });
  // });
  // it('does not expose refunds even when the intent carries completed refunds', () => {
  //   const summary = toDoctorAppointmentSummary(
  //     row({ payment_intent: { ...intent('CARD', '12', null), refunds: [{ amount: new Prisma.Decimal('12'), status: 'COMPLETED' }] } }),
  //   );
  //   expect(summary.payment).toEqual({ method: 'CARD', currency: 'EGP', serviceFee: '12.00' });
  // });
  // it('is null when no payment intent is on record', () => {
  //   expect(toDoctorAppointmentSummary(row()).payment).toBeNull();
  // });
});
