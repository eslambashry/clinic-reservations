import { Inject, Injectable } from '@nestjs/common';
import { Doctor, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository } from '../infrastructure/doctor.repository';
import { SpecialtyRepository } from '../infrastructure/specialty.repository';

export interface CreateDoctorInput {
  userId: string;
  specialtyCode: string;
  licenseNumber: string;
  regionCode?: string;
  photoUrl?: string;
}

/**
 * File 12 Part 32.5: `userId` must already exist — no cross-module user
 * provisioning here. An invalid FK surfaces as Prisma's own foreign-key
 * violation (P2003), translated below, rather than a cross-module lookup
 * call into identity-auth.
 */
@Injectable()
export class CreateDoctorUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: CreateDoctorInput, actor: AccessTokenPayload): Promise<Doctor> {
    return this.prisma.$transaction(async (tx) => {
      const specialty = await this.specialties.findByCode(tx, input.specialtyCode);
      if (!specialty) {
        throw new NotFoundError('Specialty', input.specialtyCode);
      }

      let doctor: Doctor;
      try {
        doctor = await this.doctors.create(tx, input);
      } catch (error) {
        throw translateCreateDoctorError(error, input.userId);
      }

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'provider_directory.doctor.create',
        resourceType: 'doctor',
        resourceId: doctor.id,
      });

      return doctor;
    });
  }
}

/** Never a bare `Error` (project convention: use-cases only throw `AppError` subclasses) and never the raw driver/DB error text — see the identical note on `translateCreateHoldError`. */
export function translateCreateDoctorError(error: unknown, userId: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') {
      return new NotFoundError('User', userId);
    }
    if (error.code === 'P2002') {
      return new ConflictError('DOCTOR_ALREADY_EXISTS', 'This user already has a doctor profile.', { userId });
    }
  }
  return new DomainError(500, 'INTERNAL_ERROR', 'Unexpected error while creating the doctor.');
}
