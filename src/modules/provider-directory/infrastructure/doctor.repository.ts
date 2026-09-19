import { Injectable } from '@nestjs/common';
import { Doctor, DoctorStatus, Prisma } from '@prisma/client';
import { updateWithOptimisticLock } from '../../../shared/kernel/prisma/optimistic-lock';

export interface ListDoctorsParams {
  status?: DoctorStatus;
  cursor?: { createdAt: string; id: string };
  limit: number;
  /** Offset mode (admin console only) — when set, the cursor branch is skipped. */
  skip?: number;
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
    status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED',
  ): Promise<void> {
    await updateWithOptimisticLock(db.doctor, id, currentVersion, {
      status,
      ...(status === 'VERIFIED' && { license_verified_at: new Date() }),
    });
  }

  /**
   * Admin review queue — cursor pagination on `(created_at, id)`, newest-first
   * (matching `NotificationRepository.list`, and what the dashboards' own
   * notification/review lists show: the most recent application at the top).
   */
  list(db: Prisma.TransactionClient, params: ListDoctorsParams): Promise<DoctorWithUser[]> {
    return db.doctor.findMany({
      where: buildListWhere(params),
      include: DOCTOR_WITH_USER,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: params.limit,
      ...(params.skip !== undefined && { skip: params.skip }),
    });
  }

  /** Total rows matching the same filter, ignoring pagination. */
  count(db: Prisma.TransactionClient, params: Pick<ListDoctorsParams, 'status'>): Promise<number> {
    return db.doctor.count({ where: buildListWhere(params) });
  }
}

/**
 * Shared so `list` and `count` can never drift apart — a count computed over a
 * different filter than the page would report a wrong total page count.
 * The cursor predicate is deliberately excluded in offset mode, where `skip`
 * does the positioning instead.
 */
function buildListWhere(params: Pick<ListDoctorsParams, 'status' | 'cursor' | 'skip'>): Prisma.DoctorWhereInput {
  return {
    deleted_at: null,
    ...(params.status && { status: params.status }),
    ...(params.skip === undefined &&
      params.cursor && {
        // `lt`, not `gt`: the list is ordered newest-first, so "after this
        // cursor" means older than it. These comparisons must always mirror
        // `list`'s `orderBy` or the second page silently returns the wrong rows.
        OR: [
          { created_at: { lt: new Date(params.cursor.createdAt) } },
          { created_at: new Date(params.cursor.createdAt), id: { lt: params.cursor.id } },
        ],
      }),
  };
}
