import { RoleContextType } from '@prisma/client';
import { ROLES_KEY } from '../../../shared/core/auth/roles.decorator';
import { DoctorAppointmentsController } from './doctor-appointments.controller';

describe('DoctorAppointmentsController — create (walk-in booking)', () => {
  it('allows both DOCTOR and CLINIC_STAFF to call branch/:clinicBranchId/create', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, DoctorAppointmentsController.prototype.create);
    expect(roles).toEqual(expect.arrayContaining([RoleContextType.DOCTOR, RoleContextType.CLINIC_STAFF]));
  });
});

describe('DoctorAppointmentsController - delegation', () => {
  const user = { sub: 'u1' } as any;
  const mk = () => ({ execute: jest.fn().mockResolvedValue('result') });
  const uc = { list: mk(), get: mk(), cancel: mk(), reschedule: mk(), create: mk(), lookup: mk(), visit: mk() };
  const controller = new DoctorAppointmentsController(
    uc.list as any, uc.get as any, uc.cancel as any, uc.reschedule as any, uc.create as any, uc.lookup as any, uc.visit as any,
  );

  it('lookupPatient passes the phone', async () => {
    await expect(controller.lookupPatient({ phone: '+20100' } as any)).resolves.toBe('result');
    expect(uc.lookup.execute).toHaveBeenCalledWith('+20100');
  });

  it('create merges the branch id into the dto', async () => {
    await controller.create('b1', { patientName: 'x' } as any, user);
    expect(uc.create.execute).toHaveBeenCalledWith({ patientName: 'x', clinicBranchId: 'b1' }, user);
  });

  it('list, get, updateVisitStatus, cancel, reschedule delegate', async () => {
    const dto = {} as any;
    await controller.list(dto, user);
    expect(uc.list.execute).toHaveBeenCalledWith(dto, user);
    await controller.get('a1', user);
    expect(uc.get.execute).toHaveBeenCalledWith('a1', user);
    await controller.updateVisitStatus('a1', dto, user);
    expect(uc.visit.execute).toHaveBeenCalledWith('a1', dto, user);
    await controller.cancel('a1', dto, user);
    expect(uc.cancel.execute).toHaveBeenCalledWith('a1', dto, user);
    await controller.reschedule('a1', dto, user);
    expect(uc.reschedule.execute).toHaveBeenCalledWith('a1', dto, user);
  });
});
