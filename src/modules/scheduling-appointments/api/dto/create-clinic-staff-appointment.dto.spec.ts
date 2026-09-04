import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClinicStaffAppointmentDto } from './create-clinic-staff-appointment.dto';

function build(input: Partial<CreateClinicStaffAppointmentDto>) {
  return plainToInstance(CreateClinicStaffAppointmentDto, { slotId: '11111111-1111-4111-8111-111111111111', ...input });
}

describe('CreateClinicStaffAppointmentDto', () => {
  it('passes with only patientId', async () => {
    const errors = await validate(build({ patientId: '22222222-2222-4222-8222-222222222222' }));
    expect(errors).toHaveLength(0);
  });

  it('passes with only patientPhone', async () => {
    const errors = await validate(build({ patientPhone: '+201001234567' }));
    expect(errors).toHaveLength(0);
  });

  it('fails validation when both patientId and patientPhone are given', async () => {
    const errors = await validate(
      build({ patientId: '22222222-2222-4222-8222-222222222222', patientPhone: '+201001234567' }),
    );
    expect(errors.some((e) => e.constraints && 'exactlyOnePatientIdentifier' in e.constraints)).toBe(true);
  });

  it('fails validation when neither patientId nor patientPhone is given', async () => {
    const errors = await validate(build({}));
    expect(errors.some((e) => e.constraints && 'exactlyOnePatientIdentifier' in e.constraints)).toBe(true);
  });

  it('fails validation on an invalid phone format', async () => {
    const errors = await validate(build({ patientPhone: '01001234567' }));
    expect(errors.some((e) => e.property === 'patientPhone')).toBe(true);
  });
});
