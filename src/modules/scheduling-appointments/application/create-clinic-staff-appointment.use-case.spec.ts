import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateClinicStaffAppointmentUseCase } from './create-clinic-staff-appointment.use-case';

function buildTx() {
  return {} as any;
}

describe('CreateClinicStaffAppointmentUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'membership-1', roleCode: 'CLINIC_STAFF', contextType: 'CLINIC_STAFF', permissions: [] } as any;
  const affiliation = { affiliationId: 'aff-1', clinicBranchId: 'branch-1', consultFee: 100, currency: 'EGP' };
  const scope = { doctorId: 'doctor-1', affiliations: [affiliation] };
  const slot = { id: 'slot-1', doctor_clinic_affiliation_id: 'aff-1', status: 'OPEN' };
  const baseInput = { clinicBranchId: 'branch-1', slotId: 'slot-1' };

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctorScope = { execute: jest.fn().mockResolvedValue(scope) };
    const users = { execute: jest.fn() };
    const userRepository = { findByPhone: jest.fn(), create: jest.fn() };
    const roleMemberships = { findActiveByUser: jest.fn(), create: jest.fn() };
    const slots = { findById: jest.fn().mockResolvedValue(slot), markBookedDirect: jest.fn().mockResolvedValue(true) };
    const appointments = { create: jest.fn().mockResolvedValue({ id: 'appointment-1' }) };
    const paymentsCapture = { execute: jest.fn().mockResolvedValue({ paymentIntentId: 'pi-1' }) };
    const audit = { record: jest.fn() };
    const outbox = { emit: jest.fn() };

    const useCase = new CreateClinicStaffAppointmentUseCase(
      prisma as any,
      doctorScope as any,
      users as any,
      userRepository as any,
      roleMemberships as any,
      slots as any,
      appointments as any,
      paymentsCapture as any,
      audit as any,
      outbox as any,
    );

    return { tx, prisma, doctorScope, users, userRepository, roleMemberships, slots, appointments, paymentsCapture, audit, outbox, useCase };
  }

  it('walk-in with a brand-new phone creates a User + PATIENT role_membership + CONFIRMED appointment', async () => {
    const { tx, userRepository, roleMemberships, appointments, outbox, useCase } = setup();
    userRepository.findByPhone.mockResolvedValue(null);
    userRepository.create.mockResolvedValue({ id: 'new-user-1', phone: '+201001234567' });
    roleMemberships.findActiveByUser.mockResolvedValue([]);
    roleMemberships.create.mockResolvedValue({ id: 'membership-2' });

    const result = await useCase.execute({ ...baseInput, patientPhone: '+201001234567', patientName: 'Sara' }, actor);

    expect(result).toEqual({ appointmentId: 'appointment-1', status: 'CONFIRMED' });
    expect(userRepository.findByPhone).toHaveBeenCalledWith(tx, '+201001234567');
    expect(userRepository.create).toHaveBeenCalledWith(tx, '+201001234567', 'Sara');
    expect(roleMemberships.create).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'new-user-1', roleCode: 'PATIENT' }));
    expect(appointments.create).toHaveBeenCalledWith(tx, expect.objectContaining({ patientId: 'new-user-1' }));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'AppointmentConfirmed', expect.objectContaining({ patientId: 'new-user-1' }));
  });

  it('walk-in with a phone belonging to an existing patient reuses that patient_id and does not modify the existing user', async () => {
    const { userRepository, roleMemberships, appointments, useCase } = setup();
    const existingUser = { id: 'existing-user-1', phone: '+201001234567', first_name: 'Existing' };
    userRepository.findByPhone.mockResolvedValue(existingUser);
    roleMemberships.findActiveByUser.mockResolvedValue([{ id: 'membership-existing' }]);

    const result = await useCase.execute({ ...baseInput, patientPhone: '+201001234567', patientName: 'Someone Else' }, actor);

    expect(result).toEqual({ appointmentId: 'appointment-1', status: 'CONFIRMED' });
    expect(userRepository.create).not.toHaveBeenCalled();
    expect(roleMemberships.create).not.toHaveBeenCalled();
    expect(appointments.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ patientId: 'existing-user-1' }));
  });

  it('existing patientId path still works unchanged', async () => {
    const { users, appointments, useCase } = setup();
    users.execute.mockResolvedValue({ id: 'patient-1' });

    const result = await useCase.execute({ ...baseInput, patientId: 'patient-1' }, actor);

    expect(result).toEqual({ appointmentId: 'appointment-1', status: 'CONFIRMED' });
    expect(appointments.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ patientId: 'patient-1' }));
  });

  it('404s when patientId does not resolve to a user', async () => {
    const { users, useCase } = setup();
    users.execute.mockResolvedValue(null);

    await expect(useCase.execute({ ...baseInput, patientId: 'missing' }, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('409s (SLOT_ALREADY_BOOKED) when the slot claim race is lost — unchanged coverage', async () => {
    const { users, slots, useCase } = setup();
    users.execute.mockResolvedValue({ id: 'patient-1' });
    slots.markBookedDirect.mockResolvedValue(false);

    await expect(useCase.execute({ ...baseInput, patientId: 'patient-1' }, actor)).rejects.toMatchObject({ code: 'SLOT_ALREADY_BOOKED', httpStatus: 409 });
  });

  it('409s (SLOT_ALREADY_BOOKED) when the slot is no longer OPEN', async () => {
    const { users, slots, useCase } = setup();
    users.execute.mockResolvedValue({ id: 'patient-1' });
    slots.findById.mockResolvedValue({ ...slot, status: 'HELD' });

    await expect(useCase.execute({ ...baseInput, patientId: 'patient-1' }, actor)).rejects.toMatchObject({ code: 'SLOT_ALREADY_BOOKED', httpStatus: 409 });
  });
});
