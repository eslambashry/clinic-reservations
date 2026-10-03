import { Inject, Injectable } from '@nestjs/common';
import { PrescriptionDocumentType, PrescriptionStatus } from '@prisma/client';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { ForbiddenError } from '../../../shared/core/errors/domain-errors';
import { decodeCursor, encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ResolveDoctorScopeUseCase } from '../../provider-directory/application/resolve-doctor-scope.use-case';
import { ListProviderPrescriptionsParams, PrescriptionRepository } from '../infrastructure/prescription.repository';

export interface ListProviderPrescriptionsInput {
  status?: PrescriptionStatus;
  cursor?: string;
  limit?: number;
}

export interface ProviderPrescriptionSummary {
  id: string;
  patientId: string;
  status: string;
  source: string;
  version: number;
  createdAt: string;
  createdByRole: string | null;
  decidedByUserId: string | null;
  appointmentId: string | null;
}

@Injectable()
export class ListProviderPrescriptionsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrescriptionRepository) private readonly prescriptions: PrescriptionRepository,
    @Inject(ResolveDoctorScopeUseCase) private readonly resolveDoctorScope: ResolveDoctorScopeUseCase,
  ) {}

  async execute(input: ListProviderPrescriptionsInput, actor: AccessTokenPayload): Promise<{ prescriptions: ProviderPrescriptionSummary[]; nextCursor: string | null }> {
    if (actor.contextType !== 'DOCTOR' && actor.contextType !== 'CLINIC_STAFF') {
      throw new ForbiddenError();
    }
    const scope = await this.resolveDoctorScope.execute(actor);
    const limit = Math.min(input.limit ?? 20, 50);
    const params: ListProviderPrescriptionsParams = {
      documentType: PrescriptionDocumentType.PRESCRIPTION,
      status: input.status,
      cursor: decodeCursor(input.cursor),
      limit: limit + 1,
      createdByUserId: actor.contextType === 'CLINIC_STAFF' ? actor.sub : undefined,
    };
    const rows = await this.prescriptions.findByDoctorId(this.prisma, scope.doctorUserId, params);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    return {
      prescriptions: page.map((row) => ({
        id: row.id,
        patientId: row.patient_id,
        status: row.status,
        source: row.source,
        version: row.version,
        createdAt: row.created_at.toISOString(),
        createdByRole: row.created_by_role,
        decidedByUserId: row.decided_by_user_id,
        appointmentId: row.appointment_id,
      })),
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id }) : null,
    };
  }
}
