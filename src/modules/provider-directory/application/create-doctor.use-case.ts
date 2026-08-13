import { Injectable } from '@nestjs/common';
import { Doctor, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/application/audit.service';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
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
    private readonly prisma: PrismaService,
    private readonly doctors: DoctorRepository,
    private readonly specialties: SpecialtyRepository,
    private readonly audit: AuditService,
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

export function translateCreateDoctorError(error: unknown, userId: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') {
      return new NotFoundError('User', userId);
    }
    if (error.code === 'P2002') {
      return new ConflictError('DOCTOR_ALREADY_EXISTS', 'This user already has a doctor profile.', { userId });
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}
