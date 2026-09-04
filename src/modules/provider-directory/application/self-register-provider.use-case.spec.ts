import { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
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
    const updateUserProfile = { execute: jest.fn() };
    const mediaStorage = { upload: jest.fn().mockResolvedValue({ url: 'https://ik.imagekit.io/x/doctor-profiles/user-1/photo.jpg', fileId: 'file-1', filePath: '/doctor-profiles/user-1/photo.jpg' }), getSignedUrl: jest.fn() };
    const scheduleTemplates = { create: jest.fn().mockResolvedValue({ id: 'template-1' }) };
    const useCase = new SelfRegisterProviderUseCase(
      prisma as any,
      specialties as any,
      clinics as any,
      addresses as any,
      branches as any,
      doctors as any,
      affiliations as any,
      audit as any,
      updateUserProfile as any,
      mediaStorage as any,
      scheduleTemplates as any,
    );
    return { tx, specialties, clinics, addresses, branches, doctors, affiliations, audit, updateUserProfile, mediaStorage, scheduleTemplates, useCase };
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
    const { tx, clinics, addresses, branches, doctors, affiliations, audit, updateUserProfile, useCase } = setup();

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
      degree: undefined,
      bio: undefined,
      experienceYears: undefined,
    });
    expect(updateUserProfile.execute).not.toHaveBeenCalled();
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

  it('persists degree/bio/experience_years onto Doctor and splits full_name/email through UpdateUserProfileUseCase', async () => {
    const { tx, doctors, updateUserProfile, useCase } = setup();
    const richDto = {
      ...dto,
      full_name: 'Amina El Sayed Hassan',
      degree: 'MBBCh, MD',
      email: 'amina@example.com',
      experience_years: 12,
      bio: 'Cardiologist with 12 years of experience.',
    };

    await useCase.execute(richDto, actor);

    expect(doctors.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        degree: 'MBBCh, MD',
        bio: 'Cardiologist with 12 years of experience.',
        experienceYears: 12,
      }),
    );
    expect(updateUserProfile.execute).toHaveBeenCalledWith(tx, {
      userId: 'user-1',
      firstName: 'Amina',
      lastName: 'El Sayed Hassan',
      email: 'amina@example.com',
    });
  });

  it('uploads photo_data_uri to ImageKit and persists the resulting URL onto Doctor.photo_url', async () => {
    const { tx, doctors, mediaStorage, useCase } = setup();
    const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const photoDto = { ...dto, photo_data_uri: `data:image/png;base64,${tinyPngBase64}` };

    const result = await useCase.execute(photoDto, actor);

    expect(mediaStorage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png' }),
      { folder: 'doctor-profiles/user-1', isPrivate: false },
    );
    expect(doctors.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ photoUrl: 'https://ik.imagekit.io/x/doctor-profiles/user-1/photo.jpg' }),
    );
    expect(result.notPersisted).not.toContain('photo_data_uri');
  });

  it('rejects a malformed photo_data_uri before creating anything', async () => {
    const { clinics, mediaStorage, useCase } = setup();
    const badDto = { ...dto, photo_data_uri: 'not-a-data-uri' };

    await expect(useCase.execute(badDto, actor)).rejects.toBeInstanceOf(DomainError);
    expect(mediaStorage.upload).not.toHaveBeenCalled();
    expect(clinics.create).not.toHaveBeenCalled();
  });

  it('creates one ScheduleTemplate per working_days entry, tied to the new affiliation, and no longer reports working_days as not-persisted', async () => {
    const { tx, scheduleTemplates, useCase } = setup();
    const workingDaysDto = {
      ...dto,
      working_days: [
        { weekday: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, bufferMinutes: 0 },
        { weekday: 3, startTime: '10:00', endTime: '14:00', slotDurationMinutes: 15, bufferMinutes: 5 },
      ],
    };

    const result = await useCase.execute(workingDaysDto, actor);

    expect(scheduleTemplates.create).toHaveBeenCalledTimes(2);
    expect(scheduleTemplates.create).toHaveBeenNthCalledWith(1, tx, {
      doctorClinicAffiliationId: 'affiliation-1',
      weekday: 1,
      startTime: '09:00',
      endTime: '17:00',
      slotDurationMinutes: 30,
      bufferMinutes: 0,
    });
    expect(scheduleTemplates.create).toHaveBeenNthCalledWith(2, tx, {
      doctorClinicAffiliationId: 'affiliation-1',
      weekday: 3,
      startTime: '10:00',
      endTime: '14:00',
      slotDurationMinutes: 15,
      bufferMinutes: 5,
    });
    expect(result.notPersisted).not.toContain('working_days');
  });

  it('fails the whole registration transaction when a working_days entry has an invalid time window', async () => {
    const { clinics, scheduleTemplates, useCase } = setup();
    const badWorkingDaysDto = {
      ...dto,
      working_days: [{ weekday: 1, startTime: '17:00', endTime: '09:00', slotDurationMinutes: 30, bufferMinutes: 0 }],
    };

    await expect(useCase.execute(badWorkingDaysDto, actor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(scheduleTemplates.create).not.toHaveBeenCalled();
    // Confirms the guard runs inside the same $transaction as everything else (clinic creation already happened by the time working_days is processed).
    expect(clinics.create).toHaveBeenCalled();
  });

  it('registration with no working_days still succeeds exactly as before, creating no ScheduleTemplate rows', async () => {
    const { scheduleTemplates, useCase } = setup();

    const result = await useCase.execute(dto, actor);

    expect(scheduleTemplates.create).not.toHaveBeenCalled();
    expect(result.notPersisted).toEqual([...SELF_REGISTRATION_NOT_PERSISTED_FIELDS]);
  });
});
