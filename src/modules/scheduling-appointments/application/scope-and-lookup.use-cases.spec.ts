import { RoleContextType } from '@prisma/client';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { GetDoctorAppointmentUseCase } from './get-doctor-appointment.use-case';
import { GetPharmacyHandoverAppointmentUseCase } from './get-pharmacy-handover-appointment.use-case';
import { ListMyScheduleTemplatesUseCase } from './list-my-schedule-templates.use-case';
import { isAppointmentInScope, ResolveAppointmentScopeUseCase } from './resolve-appointment-scope.use-case';

jest.mock('./doctor-appointment.mapper', () => ({
  toDoctorAppointmentSummary: jest.fn((a: any) => ({ mapped: a.id })),
}));

describe('ResolveAppointmentScopeUseCase', () => {
  const doctorScope = { execute: jest.fn() };
  const uc = new ResolveAppointmentScopeUseCase(doctorScope as any);
  beforeEach(() => doctorScope.execute.mockReset().mockResolvedValue({ doctorId: 'd1', affiliationIds: ['a1'] }));

  it('resolves DOCTOR scope', async () => {
    await expect(uc.execute({ contextType: RoleContextType.DOCTOR, sub: 'u' } as any)).resolves.toEqual({
      kind: 'DOCTOR', doctorId: 'd1', affiliationIds: ['a1'],
    });
  });

  it('resolves CLINIC_STAFF scope', async () => {
    await expect(uc.execute({ contextType: RoleContextType.CLINIC_STAFF, sub: 'u' } as any)).resolves.toEqual({
      kind: 'CLINIC_STAFF', doctorId: 'd1', affiliationIds: ['a1'],
    });
  });

  it('falls back to PATIENT scope without consulting the doctor scope', async () => {
    await expect(uc.execute({ contextType: RoleContextType.PATIENT, sub: 'u9' } as any)).resolves.toEqual({
      kind: 'PATIENT', patientUserId: 'u9',
    });
    expect(doctorScope.execute).not.toHaveBeenCalled();
  });

  it('isAppointmentInScope checks patient ownership vs affiliation membership', () => {
    const appt = { patient_id: 'p1', doctor_clinic_affiliation_id: 'a1' };
    expect(isAppointmentInScope(appt, { kind: 'PATIENT', patientUserId: 'p1' })).toBe(true);
    expect(isAppointmentInScope(appt, { kind: 'PATIENT', patientUserId: 'p2' })).toBe(false);
    expect(isAppointmentInScope(appt, { kind: 'DOCTOR', doctorId: 'd', affiliationIds: ['a1'] })).toBe(true);
    expect(isAppointmentInScope(appt, { kind: 'CLINIC_STAFF', doctorId: 'd', affiliationIds: ['zz'] })).toBe(false);
  });
});

describe('GetDoctorAppointmentUseCase', () => {
  const scope = { execute: jest.fn() };
  const appointments = { findByIdWithDoctorView: jest.fn() };
  const prisma = {} as any;
  const uc = new GetDoctorAppointmentUseCase(prisma, scope as any, appointments as any);
  const actor = { sub: 'u' } as any;

  beforeEach(() => {
    scope.execute.mockReset().mockResolvedValue({ kind: 'DOCTOR', doctorId: 'd', affiliationIds: ['a1'] });
    appointments.findByIdWithDoctorView.mockReset();
  });

  it('404s when the appointment does not exist', async () => {
    appointments.findByIdWithDoctorView.mockResolvedValue(null);
    await expect(uc.execute('x', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s (existence hiding) when outside the caller scope', async () => {
    appointments.findByIdWithDoctorView.mockResolvedValue({ id: 'x', patient_id: 'p', doctor_clinic_affiliation_id: 'other' });
    await expect(uc.execute('x', actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps an in-scope appointment', async () => {
    appointments.findByIdWithDoctorView.mockResolvedValue({ id: 'x', patient_id: 'p', doctor_clinic_affiliation_id: 'a1' });
    await expect(uc.execute('x', actor)).resolves.toEqual({ mapped: 'x' });
    expect(appointments.findByIdWithDoctorView).toHaveBeenCalledWith(prisma, 'x');
  });
});

describe('GetPharmacyHandoverAppointmentUseCase', () => {
  const appointments = { findByIdWithSlotTimes: jest.fn() };
  const uc = new GetPharmacyHandoverAppointmentUseCase(appointments as any);
  const db = {} as any;

  it('404s when missing', async () => {
    appointments.findByIdWithSlotTimes.mockResolvedValue(null);
    await expect(uc.execute(db, 'a', 'p')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s when it belongs to another patient', async () => {
    appointments.findByIdWithSlotTimes.mockResolvedValue({ patient_id: 'other' });
    await expect(uc.execute(db, 'a', 'p')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the handover projection for the owning patient', async () => {
    appointments.findByIdWithSlotTimes.mockResolvedValue({
      patient_id: 'p',
      status: 'CONFIRMED',
      doctor_clinic_affiliation_id: 'aff',
      affiliation: { clinic_branch: { id: 'br' }, doctor: { id: 'doc' } },
    });
    await expect(uc.execute(db, 'a', 'p')).resolves.toEqual({
      status: 'CONFIRMED', doctorClinicAffiliationId: 'aff', clinicBranchId: 'br', doctorId: 'doc',
    });
  });
});

describe('ListMyScheduleTemplatesUseCase', () => {
  const prisma = {} as any;
  const doctorScope = { execute: jest.fn() };
  const templates = { findByAffiliationIds: jest.fn() };
  const uc = new ListMyScheduleTemplatesUseCase(prisma, doctorScope as any, templates as any);
  const aff = (id: string) => ({
    affiliationId: id, clinicBranchId: `b-${id}`, clinicId: 'c', clinicName: 'Clinic', ianaTimezone: 'Africa/Cairo',
  });
  const tpl = (id: string, affId: string) => ({
    id, doctor_clinic_affiliation_id: affId, weekday: 1, start_time: '09:00', end_time: '12:00',
    slot_duration_minutes: 30, buffer_minutes: 0, version: 1, created_at: new Date(0), updated_at: new Date(0),
  });

  beforeEach(() => {
    doctorScope.execute.mockReset();
    templates.findByAffiliationIds.mockReset();
  });

  it('returns empty without a query when the doctor has no affiliations', async () => {
    doctorScope.execute.mockResolvedValue({ affiliations: [] });
    await expect(uc.execute({}, {} as any)).resolves.toEqual({ items: [] });
    expect(templates.findByAffiliationIds).not.toHaveBeenCalled();
  });

  it('combines every owned affiliation by default and drops templates without a matching affiliation', async () => {
    doctorScope.execute.mockResolvedValue({ affiliations: [aff('a1'), aff('a2')] });
    templates.findByAffiliationIds.mockResolvedValue([tpl('t1', 'a1'), tpl('t2', 'a2'), tpl('t3', 'ghost')]);
    const res = await uc.execute({}, {} as any);
    expect(templates.findByAffiliationIds).toHaveBeenCalledWith(prisma, ['a1', 'a2']);
    expect(res.items.map((i) => i.id)).toEqual(['t1', 't2']);
    expect(res.items[0]).toEqual(expect.objectContaining({ clinicBranchId: 'b-a1', startTime: '09:00' }));
  });

  it('narrows to one owned affiliation', async () => {
    doctorScope.execute.mockResolvedValue({ affiliations: [aff('a1'), aff('a2')] });
    templates.findByAffiliationIds.mockResolvedValue([tpl('t2', 'a2')]);
    await uc.execute({ affiliationId: 'a2' }, {} as any);
    expect(templates.findByAffiliationIds).toHaveBeenCalledWith(prisma, ['a2']);
  });

  it('404s for an affiliation outside the caller scope', async () => {
    doctorScope.execute.mockResolvedValue({ affiliations: [aff('a1')] });
    await expect(uc.execute({ affiliationId: 'zz' }, {} as any)).rejects.toBeInstanceOf(NotFoundError);
    expect(templates.findByAffiliationIds).not.toHaveBeenCalled();
  });
});
