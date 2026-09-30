import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { UserRepository } from '../../identity-auth/infrastructure/user.repository';

export interface LookupPatientByPhoneResult {
  exists: boolean;
  /** Existing user's name, so clinic staff can confirm this is the intended patient before booking reuses that account. `null` when no account exists for the phone, or the account has no name on file. */
  name: string | null;
}

function fullName(user: { first_name: string | null; last_name: string | null }): string | null {
  const joined = [user.first_name, user.last_name].filter((part): part is string => !!part).join(' ');
  return joined || null;
}

/**
 * Backs the clinic-staff walk-in booking form's phone field: before
 * `CreateClinicStaffAppointmentUseCase` silently reuses an existing account
 * by phone (never overwriting its name — see that use-case's comment),
 * clinic staff need to see whose account that is, so a phone number typo or
 * a name that only coincidentally matches doesn't book an appointment onto
 * the wrong patient's record.
 */
@Injectable()
export class LookupPatientByPhoneUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UserRepository) private readonly userRepository: UserRepository,
  ) {}

  async execute(phone: string): Promise<LookupPatientByPhoneResult> {
    const user = await this.userRepository.findByPhone(this.prisma, phone);
    if (!user) {
      return { exists: false, name: null };
    }
    return { exists: true, name: fullName(user) };
  }
}
