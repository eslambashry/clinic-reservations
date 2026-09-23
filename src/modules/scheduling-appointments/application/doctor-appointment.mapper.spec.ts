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

  it('shows the partial amount paid online and the rest to collect at the clinic', () => {
    const summary = toDoctorAppointmentSummary(
      row({ payment_intent: intent('FAWRY', '50', '500'), remaining_balance: new Prisma.Decimal('450') }),
    );

    expect(summary.payment).toEqual({
      method: 'FAWRY',
      currency: 'EGP',
      fullAmount: '500.00',
      paidAmount: '50.00',
      remainingBalance: '450.00',
    });
  });

  it('treats pay-at-clinic as nothing paid yet, the whole fee due', () => {
    const summary = toDoctorAppointmentSummary(row({ payment_intent: intent('PAY_AT_CLINIC', '300', null) }));

    expect(summary.payment).toEqual({
      method: 'PAY_AT_CLINIC',
      currency: 'EGP',
      fullAmount: '300.00',
      paidAmount: '0.00',
      remainingBalance: '300.00',
    });
  });

  it('treats a pre-partial-payment online intent (no full_amount) as paid in full', () => {
    const summary = toDoctorAppointmentSummary(row({ payment_intent: intent('INTERNAL_WALLET', '300', null) }));

    expect(summary.payment).toMatchObject({ fullAmount: '300.00', paidAmount: '300.00', remainingBalance: '0.00' });
  });

  it('is null when no payment intent is on record', () => {
    expect(toDoctorAppointmentSummary(row()).payment).toBeNull();
  });
});
