import { Injectable } from '@nestjs/common';
import { Doctor, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface CreateDoctorInput {
  userId: string;
  specialtyCode: string;
  licenseNumber: string;
  regionCode?: string;
  photoUrl?: string;
}

export interface UpdateDoctorInput {
  specialtyCode?: string;
  licenseNumber?: string;
  regionCode?: string;
  photoUrl?: string;
}

const DOCTOR_WITH_USER = { user: true, specialty: true } satisfies Prisma.DoctorInclude;
export type DoctorWithUser = Prisma.DoctorGetPayload<{ include: typeof DOCTOR_WITH_USER }>;

@Injectable()
export class DoctorRepository {
  create(db: Prisma.TransactionClient, input: CreateDoctorInput): Promise<Doctor> {
    return db.doctor.create({
      data: {
        user_id: input.userId,
        specialty_code: input.specialtyCode,
        license_number: input.licenseNumber,
        region_code: input.regionCode,
        photo_url: input.photoUrl,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Doctor | null> {
    return db.doctor.findUnique({ where: { id } });
  }

  findByIdWithUser(db: Prisma.TransactionClient, id: string): Promise<DoctorWithUser | null> {
    return db.doctor.findUnique({ where: { id }, include: DOCTOR_WITH_USER });
  }

  async update(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    input: UpdateDoctorInput,
  ): Promise<void> {
    await updateWithOptimisticLock(db.doctor, id, currentVersion, {
      ...(input.specialtyCode !== undefined && { specialty_code: input.specialtyCode }),
      ...(input.licenseNumber !== undefined && { license_number: input.licenseNumber }),
      ...(input.regionCode !== undefined && { region_code: input.regionCode }),
      ...(input.photoUrl !== undefined && { photo_url: input.photoUrl }),
    });
  }

  async setStatus(
    db: Prisma.TransactionClient,
    id: string,
    currentVersion: number,
    status: 'VERIFIED' | 'SUSPENDED',
  ): Promise<void> {
    await updateWithOptimisticLock(db.doctor, id, currentVersion, {
      status,
      ...(status === 'VERIFIED' && { license_verified_at: new Date() }),
    });
  }
}
