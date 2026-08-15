import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository, UpdateDoctorInput } from '../infrastructure/doctor.repository';
import { SpecialtyRepository } from '../infrastructure/specialty.repository';

@Injectable()
export class UpdateDoctorUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(doctorId: string, input: UpdateDoctorInput, actor: AccessTokenPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const doctor = await this.doctors.findById(tx, doctorId);
      if (!doctor) {
        throw new NotFoundError('Doctor', doctorId);
      }
      if (input.specialtyCode) {
        const specialty = await this.specialties.findByCode(tx, input.specialtyCode);
        if (!specialty) {
          throw new NotFoundError('Specialty', input.specialtyCode);
        }
      }

      await this.doctors.update(tx, doctorId, doctor.version, input);

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.doctor.update',
        resourceType: 'doctor',
        resourceId: doctorId,
      });
    });
  }
}
