import { LookupPatientByPhoneUseCase } from './lookup-patient-by-phone.use-case';

describe('LookupPatientByPhoneUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const userRepository = { findByPhone: jest.fn() };
    const useCase = new LookupPatientByPhoneUseCase(prisma, userRepository as any);
    return { prisma, userRepository, useCase };
  }

  it('returns exists: false when no account has this phone', async () => {
    const { prisma, userRepository, useCase } = setup();
    userRepository.findByPhone.mockResolvedValue(null);

    const result = await useCase.execute('+201001234567');

    expect(result).toEqual({ exists: false, name: null });
    expect(userRepository.findByPhone).toHaveBeenCalledWith(prisma, '+201001234567');
  });

  it('returns the existing account\'s full name when the phone is already registered', async () => {
    const { userRepository, useCase } = setup();
    userRepository.findByPhone.mockResolvedValue({ first_name: 'Sara', last_name: 'Ahmed' });

    const result = await useCase.execute('+201001234567');

    expect(result).toEqual({ exists: true, name: 'Sara Ahmed' });
  });

  it('returns name: null when the existing account has no name on file', async () => {
    const { userRepository, useCase } = setup();
    userRepository.findByPhone.mockResolvedValue({ first_name: null, last_name: null });

    const result = await useCase.execute('+201001234567');

    expect(result).toEqual({ exists: true, name: null });
  });
});
