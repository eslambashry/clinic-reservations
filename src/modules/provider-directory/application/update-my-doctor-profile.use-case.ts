import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository } from '../infrastructure/doctor.repository';
import { GetMyDoctorProfileUseCase, MyDoctorProfile } from './get-my-doctor-profile.use-case';

export interface UpdateMyDoctorProfileInput {
  bio?: string;
  degree?: string;
  experienceYears?: number;
}

/**
 * `PATCH /v1/doctors/me` (File 12 Part 45) — the doctor's own self-edit,
 * deliberately narrower than the Admin-only `PATCH /v1/doctors/{id}`:
 * `specialtyCode`/`licenseNumber`/`regionCode` stay Admin-controlled (a
 * doctor can't re-specialize or re-license themselves), and `photoUrl`
 * is excluded until an object-storage decision exists (same gap as
 * `ProviderVerificationDocument.file_url`/prescription uploads).
 */
@Injectable()
export class UpdateMyDoctorProfileUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(GetMyDoctorProfileUseCase) private readonly getMyDoctorProfile: GetMyDoctorProfileUseCase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(actor: AccessTokenPayload, input: UpdateMyDoctorProfileInput): Promise<MyDoctorProfile> {
    const doctor = await this.doctors.findByUserId(this.prisma, actor.sub);
    if (!doctor) {
      throw new NotFoundError('Doctor', actor.sub);
    }

    if (input.bio !== undefined || input.degree !== undefined || input.experienceYears !== undefined) {
      await this.prisma.$transaction(async (tx) => {
        await this.doctors.update(tx, doctor.id, doctor.version, {
          bio: input.bio,
          degree: input.degree,
          experienceYears: input.experienceYears,
        });

        // File 12 Part 49.1: a doctor editing their own directory record is
        // an audited write like every other provider-directory mutation —
        // this was the one self-service edit missing an `audit_logs` row.
        await this.audit.record(tx, {
          actorUserId: actor.sub,
          actorRoleMembershipId: actor.roleMembershipId,
          action: 'provider_directory.doctor.update_self',
          resourceType: 'doctor',
          resourceId: doctor.id,
        });
      });
    }

    return this.getMyDoctorProfile.execute(actor);
  }
}
