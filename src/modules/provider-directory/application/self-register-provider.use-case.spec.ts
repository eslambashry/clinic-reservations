import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { SELF_REGISTRATION_NOT_PERSISTED_FIELDS, SelfRegisterProviderUseCase } from './self-register-provider.use-case';

function buildTx() {
  return {} as any;
}

function duplicateUserViolation() {
  return new Prisma.PrismaClientKnownRequestError('unique violation', { code: 'P2002', clientVersion: '5.22.0' });
}

describe('SelfRegisterProviderUseCase', () => {
  const actor = { sub: 'user-1', roleMembershipId: 'membership-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const dto = {
    specialty: 'CARDIOLOGY',
    license_number: 'EG-MED-99999',
    region_code: 'CAI',
    clinic_name: 'Dr. Amina Clinic',
    clinic_address: '12 Tahrir St',
    city: 'Cairo',
    phone: '+201000000000',
    consultation_fee: 250,
  } as any;

  function setup() {
    const tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const specialties = { findByCode: jest.fn().mockResolvedValue({ code: 'CARDIOLOGY' }) };
    const clinics = { create: jest.fn().mockResolvedValue({ id: 'clinic-1' }) };
    const addresses = { create: jest.fn().mockResolvedValue({ id: 'address-1' }) };
    const branches = { create: jest.fn().mockResolvedValue({ id: 'branch-1' }) };
    const doctors = { create: jest.fn().mockResolvedValue({ id: 'doctor-1', status: 'PENDING' }) };
    const affiliations = { create: jest.fn().mockResolvedValue({ id: 'affiliation-1' }) };
    const audit = { record: jest.fn() };
    const useCase = new SelfRegisterProviderUseCase(
      prisma as any,
      specialties as any,
      clinics as any,
      addresses as any,
      branches as any,
      doctors as any,
      affiliations as any,
      audit as any,
    );
    return { tx, specialties, clinics, addresses, branches, doctors, affiliations, audit, useCase };
  }

  it('rejects an unknown specialty before creating anything', async () => {
    const { specialties, clinics, useCase } = setup();
    specialties.findByCode.mockResolvedValue(null);

    await expect(useCase.execute(dto, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(clinics.create).not.toHaveBeenCalled();
  });

  it('forces Doctor.user_id to the caller, never a client-supplied value', async () => {
    const { doctors, useCase } = setup();

    await useCase.execute(dto, actor);

    expect(doctors.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 'user-1' }));
  });

  it('translates a duplicate registration into DOCTOR_ALREADY_EXISTS', async () => {
    const { doctors, useCase } = setup();
    doctors.create.mockRejectedValue(duplicateUserViolation());

    await expect(useCase.execute(dto, actor)).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates clinic, address, branch, doctor and affiliation in one transaction, audits it, and reports not-persisted fields', async () => {
    const { tx, clinics, addresses, branches, doctors, affiliations, audit, useCase } = setup();

    const result = await useCase.execute(dto, actor);

    expect(clinics.create).toHaveBeenCalledWith(tx, { legalName: dto.clinic_name, brandName: dto.clinic_name });
    expect(addresses.create).toHaveBeenCalledWith(tx, {
      line1: dto.clinic_address,
      city: dto.city,
      regionCode: dto.region_code,
      countryCode: 'EG',
    });
    expect(branches.create).toHaveBeenCalledWith(tx, {
      clinicId: 'clinic-1',
      addressId: 'address-1',
      phone: dto.phone,
      ianaTimezone: 'Africa/Cairo',
    });
    expect(doctors.create).toHaveBeenCalledWith(tx, {
      userId: 'user-1',
      specialtyCode: dto.specialty,
      licenseNumber: dto.license_number,
      regionCode: dto.region_code,
    });
    expect(affiliations.create).toHaveBeenCalledWith(tx, {
      doctorId: 'doctor-1',
      clinicBranchId: 'branch-1',
      consultFee: '250',
      currency: 'EGP',
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: 'user-1',
        action: 'provider_directory.self_registration.submit',
        resourceType: 'doctor',
        resourceId: 'doctor-1',
      }),
    );
    expect(result).toEqual({
      doctorId: 'doctor-1',
      clinicId: 'clinic-1',
      clinicBranchId: 'branch-1',
      affiliationId: 'affiliation-1',
      status: 'PENDING',
      notPersisted: [...SELF_REGISTRATION_NOT_PERSISTED_FIELDS],
    });
  });
});
