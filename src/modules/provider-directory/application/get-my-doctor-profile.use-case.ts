import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository } from '../infrastructure/doctor.repository';

export interface MyDoctorProfile {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string;
  specialty: string;
  specialtyKey: string;
  licenseNumber: string;
  bio: string | null;
  degree: string | null;
  experienceYears: number | null;
  /**
   * Pre-hosted URL only, same gap as `Doctor.photo_url`'s own schema comment
   * (File 12 Part 32.1) — no upload flow exists, so this is read-only from
   * whatever was set at creation. `PATCH /v1/doctors/me` deliberately does
   * not accept this field until an object-storage decision exists.
   */
  photoUrl: string | null;
  isVerified: boolean;
}

/**
 * `GET /v1/doctors/me` (File 12 Part 45) — a doctor reading their own
 * directory record, resolved from the caller's own `user_id` rather than a
 * path param, same "server-resolves-the-caller's-own-scope" convention as
 * `PHARMACY_STAFF`'s branch-scoped endpoints. Includes `licenseNumber`,
 * which the public `GET /v1/doctors/{id}` deliberately omits.
 */
@Injectable()
export class GetMyDoctorProfileUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
  ) {}

  async execute(actor: AccessTokenPayload): Promise<MyDoctorProfile> {
    const doctor = await this.doctors.findByUserIdWithUser(this.prisma, actor.sub);
    if (!doctor) {
      throw new NotFoundError('Doctor', actor.sub);
    }

    return {
      id: doctor.id,
      displayName: [doctor.user.first_name, doctor.user.last_name].filter(Boolean).join(' ') || null,
      email: doctor.user.email,
      phone: doctor.user.phone,
      specialty: doctor.specialty.name_en,
      specialtyKey: doctor.specialty.code,
      licenseNumber: doctor.license_number,
      bio: doctor.bio,
      degree: doctor.degree,
      experienceYears: doctor.experience_years,
      photoUrl: doctor.photo_url,
      isVerified: doctor.status === 'VERIFIED',
    };
  }
}
