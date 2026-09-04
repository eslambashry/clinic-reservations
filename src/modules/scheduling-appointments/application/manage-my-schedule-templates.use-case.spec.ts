import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { ManageMyScheduleTemplatesUseCase } from './manage-my-schedule-templates.use-case';

describe('ManageMyScheduleTemplatesUseCase', () => {
  const actor = { sub: 'user-1', roleMembershipId: 'membership-1', roleCode: 'DOCTOR', contextType: 'DOCTOR', permissions: [] } as any;
  const affiliation = {
    affiliationId: 'aff-1',
    clinicBranchId: 'branch-1',
    clinicId: 'clinic-1',
    clinicName: 'Nile Clinic',
    ianaTimezone: 'Africa/Cairo',
  } as any;
  const templateRow = {
    id: 'template-1',
    doctor_clinic_affiliation_id: 'aff-1',
    weekday: 1,
    start_time: '09:00',
    end_time: '17:00',
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    version: 3,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
  };

  function setup(affiliations = [affiliation]) {
    const doctorScope = {
      execute: jest.fn().mockResolvedValue({
        doctorId: 'doctor-1',
        affiliations,
        affiliationIds: affiliations.map((a: any) => a.affiliationId),
        clinicBranchIds: affiliations.map((a: any) => a.clinicBranchId),
      }),
    };
    const createTemplate = { execute: jest.fn().mockResolvedValue(templateRow) };
    const updateTemplate = { execute: jest.fn().mockResolvedValue(templateRow) };
    const deleteTemplate = { execute: jest.fn() };
    const useCase = new ManageMyScheduleTemplatesUseCase(
      doctorScope as any,
      createTemplate as any,
      updateTemplate as any,
      deleteTemplate as any,
    );
    return { doctorScope, createTemplate, updateTemplate, deleteTemplate, useCase };
  }

  const createInput = {
    doctorClinicAffiliationId: 'aff-1',
    weekday: 1,
    startTime: '09:00',
    endTime: '17:00',
    slotDurationMinutes: 30,
    bufferMinutes: 0,
  };

  it('404s a create against an affiliation the caller does not own, without delegating', async () => {
    const { createTemplate, useCase } = setup([{ ...affiliation, affiliationId: 'aff-other' }]);

    await expect(useCase.create(createInput, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(createTemplate.execute).not.toHaveBeenCalled();
  });

  it('delegates create to the shared use-case and maps the row to the camelCase doctor shape', async () => {
    const { createTemplate, useCase } = setup();

    const result = await useCase.create(createInput, actor);

    expect(createTemplate.execute).toHaveBeenCalledWith(createInput, actor);
    expect(result).toMatchObject({
      id: 'template-1',
      doctorClinicAffiliationId: 'aff-1',
      clinicBranchId: 'branch-1',
      clinicName: 'Nile Clinic',
      ianaTimezone: 'Africa/Cairo',
      weekday: 1,
      startTime: '09:00',
      endTime: '17:00',
      slotDurationMinutes: 30,
      version: 3,
    });
  });

  it('pushes an ownership predicate into the shared update use-case that rejects another doctor’s template', async () => {
    const { updateTemplate, useCase } = setup();

    await useCase.update('template-1', { startTime: '10:00', version: 3 }, actor);

    const options = updateTemplate.execute.mock.calls[0][3];
    expect(updateTemplate.execute).toHaveBeenCalledWith('template-1', { startTime: '10:00' }, actor, expect.any(Object));
    expect(options.expectedVersion).toBe(3);
    expect(options.assertOwned({ doctor_clinic_affiliation_id: 'aff-1' })).toBe(true);
    expect(options.assertOwned({ doctor_clinic_affiliation_id: 'aff-someone-else' })).toBe(false);
  });

  it('does not leak the client-supplied version into the field patch', async () => {
    const { updateTemplate, useCase } = setup();

    await useCase.update('template-1', { weekday: 2, version: 7 }, actor);

    expect(updateTemplate.execute.mock.calls[0][1]).toEqual({ weekday: 2 });
  });

  it('passes ownership and the optimistic-lock token through to delete', async () => {
    const { deleteTemplate, useCase } = setup();

    await useCase.remove('template-1', 3, actor);

    const options = deleteTemplate.execute.mock.calls[0][2];
    expect(options.expectedVersion).toBe(3);
    expect(options.assertOwned({ doctor_clinic_affiliation_id: 'aff-1' })).toBe(true);
    expect(options.assertOwned({ doctor_clinic_affiliation_id: 'aff-other' })).toBe(false);
  });
});
