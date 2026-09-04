import { Inject, Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';
import { DoctorAppointmentSummary, toDoctorAppointmentSummary } from './doctor-appointment.mapper';

export interface ListDoctorAppointmentsInput {
  status?: AppointmentStatus;
  from?: string;
  to?: string;
  /** Narrowing filter only — must be a branch the caller is affiliated with. */
  clinicBranchId?: string;
  cursor?: string;
  limit?: number;
}

export interface ListDoctorAppointmentsResult {
  items: DoctorAppointmentSummary[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface AppointmentCursor {
  s: string;
  i: string;
}

/**
 * `GET /v1/doctors/me/appointments` (File 12 Part 49.7) — the Doctor
 * Dashboard queue File 11 05.3 called for, scoped by the caller's own
 * affiliations rather than a branch path param.
 *
 * Same cursor/limit semantics as the patient list (Part 35.15): sorted by
 * the slot's `start_at`, `(start_at, id)` cursor, `limit` capped at 50.
 * A `clinicBranchId` filter narrows the JWT-derived affiliation set — it is
 * intersected with it, never substituted for it, so passing another clinic's
 * branch id yields a 404 rather than that clinic's appointments.
 */
@Injectable()
export class ListDoctorAppointmentsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResolveDoctorScopeUseCase) private readonly doctorScope: ResolveDoctorScopeUseCase,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
  ) {}

  async execute(input: ListDoctorAppointmentsInput, actor: AccessTokenPayload): Promise<ListDoctorAppointmentsResult> {
    const scope = await this.doctorScope.execute(actor);

    let affiliationIds = scope.affiliationIds;
    if (input.clinicBranchId) {
      const branchId = input.clinicBranchId;
      if (!scope.clinicBranchIds.includes(branchId)) {
        throw new NotFoundError('ClinicBranch', branchId);
      }
      affiliationIds = scope.affiliations
        .filter((affiliation) => affiliation.clinicBranchId === branchId)
        .map((affiliation) => affiliation.affiliationId);
    }

    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<AppointmentCursor>(input.cursor);

    const rows = await this.appointments.listForDoctor(this.prisma, {
      affiliationIds,
      status: input.status,
      from: input.from ? new Date(input.from) : undefined,
      to: input.to ? new Date(input.to) : undefined,
      cursor: cursor ? { startAt: cursor.s, id: cursor.i } : undefined,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map(toDoctorAppointmentSummary),
      nextCursor: hasMore && last ? encodeCursor<AppointmentCursor>({ s: last.slot.start_at.toISOString(), i: last.id }) : null,
    };
  }
}
