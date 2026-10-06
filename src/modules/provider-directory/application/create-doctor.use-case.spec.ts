import { Prisma } from '@prisma/client';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateDoctorUseCase, translateCreateDoctorError } from './create-doctor.use-case';

const actor = { sub: 'a1', roleMembershipId: 'rm1' } as any;
const input = { userId: 'u1', specialtyCode: 'CARDIO', licenseNumber: 'L1' };
const prismaErr = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' });

describe('CreateDoctorUseCase', () => {
  function setup() {
    const tx = {} as any;
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const doctors = { create: jest.fn().mockResolvedValue({ id: 'd1' }) };
    const specialties = { findByCode: jest.fn().mockResolvedValue({ code: 'CARDIO' }) };
    const audit = { record: jest.fn() };
    return { tx, doctors, specialties, audit, useCase: new CreateDoctorUseCase(prisma as any, doctors as any, specialties as any, audit as any) };
  }

  it('404s on unknown specialty', async () => {
    const { useCase, specialties, doctors } = setup();
    specialties.findByCode.mockResolvedValue(null);
    await expect(useCase.execute(input, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(doctors.create).not.toHaveBeenCalled();
  });

  it('creates and audits', async () => {
    const { tx, useCase, doctors, audit } = setup();
    await expect(useCase.execute(input, actor)).resolves.toEqual({ id: 'd1' });
    expect(doctors.create).toHaveBeenCalledWith(tx, input);
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ resourceId: 'd1' }));
  });

  it('translates repository errors', async () => {
    const { useCase, doctors, audit } = setup();
    doctors.create.mockRejectedValue(prismaErr('P2002'));
    await expect(useCase.execute(input, actor)).rejects.toBeInstanceOf(ConflictError);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('translateCreateDoctorError', () => {
  it('maps P2003 to NotFound(User)', () => {
    expect(translateCreateDoctorError(prismaErr('P2003'), 'u1')).toBeInstanceOf(NotFoundError);
  });

  it('maps P2002 to conflict', () => {
    expect(translateCreateDoctorError(prismaErr('P2002'), 'u1')).toBeInstanceOf(ConflictError);
  });

  it('maps other Prisma codes to a generic 500 DomainError', () => {
    const err = translateCreateDoctorError(prismaErr('P9999'), 'u1');
    expect(err).toBeInstanceOf(DomainError);
    expect((err as any).code).toBe('INTERNAL_ERROR');
  });

  it('maps unknown errors to a generic 500 DomainError', () => {
    expect(translateCreateDoctorError(new Error('boom'), 'u1')).toBeInstanceOf(DomainError);
  });
});
