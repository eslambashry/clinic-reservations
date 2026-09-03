import { Inject, Injectable } from '@nestjs/common';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository } from '../infrastructure/doctor.repository';

export interface MyDoctorRegistrationStatusResult {
  doctorId: string;
  status: 'PENDING' | 'VERIFIED' | 'SUSPENDED';
}

/**
 * The self-registration flow (`SelfRegisterProviderUseCase`) never grants a
 * `DOCTOR` role_membership — it only creates `PENDING` records, exactly like
 * an Admin-created one would (see that use-case's own doc comment). So the
 * caller's JWT stays `PATIENT` throughout, and `GET /v1/doctors/:doctorId`
 * 404s for anyone but an Admin while the doctor is still `PENDING`
 * (`isProviderEntityVisible` requires `VERIFIED`) — there was previously no
 * way at all for a self-registered applicant to check their own status.
 * This endpoint is scoped to the caller's own record only (`findByUserId`,
 * never a client-supplied doctor id), and is intentionally visible
 * regardless of status — the applicant needs to see PENDING, not get a 404.
 */
@Injectable()
export class GetMyDoctorRegistrationStatusUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
  ) {}

  async execute(actor: AccessTokenPayload): Promise<MyDoctorRegistrationStatusResult> {
    const doctor = await this.doctors.findByUserId(this.prisma, actor.sub);
    if (!doctor) {
      throw new NotFoundError('DoctorRegistration', actor.sub);
    }

    return { doctorId: doctor.id, status: doctor.status };
  }
}
