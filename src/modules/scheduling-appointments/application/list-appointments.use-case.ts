import { Inject, Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AppointmentSummary, toAppointmentSummary } from './get-appointment.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';

export interface ListAppointmentsInput {
  status?: AppointmentStatus;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface ListAppointmentsResult {
  items: AppointmentSummary[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface AppointmentCursor {
  s: string;
  i: string;
}

/**
 * File 10 §2.3 `GET /v1/appointments` ("My Appointments") / File 12 Part
 * 35.14/35.15: patient-only in this increment, scoped automatically to the
 * caller — never a query param the client can widen. Sorted/paginated by
 * the slot's `start_at`, not `created_at` (Part 35.15).
 */
@Injectable()
export class ListAppointmentsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
  ) {}

  async execute(input: ListAppointmentsInput, actor: AccessTokenPayload): Promise<ListAppointmentsResult> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = decodeCursor<AppointmentCursor>(input.cursor);

    const rows = await this.appointments.listForPatient(this.prisma, {
      patientId: actor.sub,
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
      items: page.map(toAppointmentSummary),
      nextCursor: hasMore && last ? encodeCursor<AppointmentCursor>({ s: last.slot.start_at.toISOString(), i: last.id }) : null,
    };
  }
}
