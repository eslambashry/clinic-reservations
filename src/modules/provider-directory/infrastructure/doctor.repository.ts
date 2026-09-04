import { Injectable } from '@nestjs/common';
import { Doctor, DoctorStatus, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface ListDoctorsParams {
  status?: DoctorStatus;
  cursor?: { createdAt: string; id: string };
  limit: number;
}

export interface CreateDoctorInput {
  userId: string;
  specialtyCode: string;
  licenseNumber: string;
  regionCode?: string;
  photoUrl?: string;
  degree?: string;
  bio?: string;
  experienceYears?: number;
}

export interface UpdateDoctorInput {
  specialtyCode?: string;
  licenseNumber?: string;
  regionCode?: string;
  photoUrl?: string;
  bio?: string;
  degree?: string;
  experienceYears?: number;
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
        degree: input.degree,
        bio: input.bio,
        experience_years: input.experienceYears,
      },
    });
  }

  findById(db: Prisma.TransactionClient, id: string): Promise<Doctor | null> {
    return db.doctor.findUnique({ where: { id } });
  }

  findByUserId(db: Prisma.TransactionClient, userId: string): Promise<Doctor | null> {
    return db.doctor.findUnique({ where: { user_id: userId } });
  }

  findByUserIdWithUser(db: Prisma.TransactionClient, userId: string): Promise<DoctorWithUser | null> {
    return db.doctor.findUnique({ where: { user_id: userId }, include: DOCTOR_WITH_USER });
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
      ...(input.bio !== undefined && { bio: input.bio }),
      ...(input.degree !== undefined && { degree: input.degree }),
      ...(input.experienceYears !== undefined && { experience_years: input.experienceYears }),
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

  /** Admin review queue — cursor pagination on `(created_at, id)`, oldest-first, same shape as `VerificationDocumentRepository.list`. */
  list(db: Prisma.TransactionClient, params: ListDoctorsParams): Promise<DoctorWithUser[]> {
    return db.doctor.findMany({
      where: {
        deleted_at: null,
        ...(params.status && { status: params.status }),
        ...(params.cursor && {
          OR: [
            { created_at: { gt: new Date(params.cursor.createdAt) } },
            { created_at: new Date(params.cursor.createdAt), id: { gt: params.cursor.id } },
          ],
        }),
      },
      include: DOCTOR_WITH_USER,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: params.limit,
    });
  }
}
