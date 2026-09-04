import { RoleContextType } from '@prisma/client';
import { ROLES_KEY } from '../../../shared/core/auth/roles.decorator';
import { DoctorAppointmentsController } from './doctor-appointments.controller';

describe('DoctorAppointmentsController — create (walk-in booking)', () => {
  it('allows both DOCTOR and CLINIC_STAFF to call branch/:clinicBranchId/create', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, DoctorAppointmentsController.prototype.create);
    expect(roles).toEqual(expect.arrayContaining([RoleContextType.DOCTOR, RoleContextType.CLINIC_STAFF]));
  });
});
