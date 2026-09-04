import { Inject, Injectable } from '@nestjs/common';
import { DoctorStatus } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRepository, DoctorWithUser } from '../infrastructure/doctor.repository';

export interface ListDoctorsInput {
  status?: DoctorStatus;
  cursor?: string;
  limit?: number;
}

export interface DoctorListItem {
  id: string;
  name: string;
  phone: string;
  specialtyCode: string;
  specialty: string;
  licenseNumber: string;
  regionCode: string | null;
  status: DoctorStatus;
  photoUrl: string | null;
  createdAt: string;
}

export interface ListDoctorsResult {
  items: DoctorListItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface DoctorListCursor {
  c: string;
  i: string;
}

/**
 * Admin review queue — the list this app's Admin surface actually needs
 * and `DoctorsController` never had: `search` only ever returns VERIFIED
 * doctors (public discovery), and `GetDoctorUseCase`'s Admin bypass is
 * single-record, not a queue. Oldest-first, same convention as
 * `ListVerificationDocumentsUseCase`'s review queue.
 */
@Injectable()
export class ListDoctorsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
  ) {}

  async execute(input: ListDoctorsInput): Promise<ListDoctorsResult> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<DoctorListCursor>(input.cursor);

    const rows = await this.doctors.list(this.prisma, {
      status: input.status,
      cursor: cursor ? { createdAt: cursor.c, id: cursor.i } : undefined,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toListItem),
      nextCursor: hasMore && last ? encodeCursor<DoctorListCursor>({ c: last.created_at.toISOString(), i: last.id }) : null,
    };
  }
}

function toListItem(row: DoctorWithUser): DoctorListItem {
  const name = [row.user.first_name, row.user.last_name].filter(Boolean).join(' ') || 'Unknown';
  return {
    id: row.id,
    name,
    phone: row.user.phone,
    specialtyCode: row.specialty_code,
    specialty: row.specialty.name_en,
    licenseNumber: row.license_number,
    regionCode: row.region_code,
    status: row.status,
    photoUrl: row.photo_url,
    createdAt: row.created_at.toISOString(),
  };
}
