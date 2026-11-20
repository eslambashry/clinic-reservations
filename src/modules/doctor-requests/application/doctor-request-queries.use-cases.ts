import { Inject, Injectable } from '@nestjs/common';
import { DoctorRequestStatus } from '@prisma/client';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OffsetPageMeta, buildPageMeta, resolveOffset } from '../../../shared/core/pagination/offset.util';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { DoctorRequestRepository } from '../infrastructure/doctor-request.repository';
import { AdminDoctorRequest, MyDoctorRequest, toAdminDoctorRequest, toMyDoctorRequest } from './doctor-request.mapper';

const MY_REQUESTS_LIMIT = 50;

@Injectable()
export class ListMyDoctorRequestsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRequestRepository) private readonly requests: DoctorRequestRepository,
  ) {}

  async execute(actor: AccessTokenPayload): Promise<{ items: MyDoctorRequest[] }> {
    const rows = await this.requests.listForPatient(this.prisma, actor.sub, MY_REQUESTS_LIMIT);
    return { items: rows.map(toMyDoctorRequest) };
  }
}

export interface AdminDoctorRequestsResult extends OffsetPageMeta {
  items: AdminDoctorRequest[];
}

@Injectable()
export class ListAdminDoctorRequestsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRequestRepository) private readonly requests: DoctorRequestRepository,
  ) {}

  async execute(input: { status?: DoctorRequestStatus; page?: number; limit?: number }): Promise<AdminDoctorRequestsResult> {
    const { skip, take, page, limit } = resolveOffset(input);
    const { rows, total } = await this.requests.listForAdmin(this.prisma, { status: input.status, skip, take });
    return { items: rows.map(toAdminDoctorRequest), ...buildPageMeta(total, page, limit) };
  }
}

@Injectable()
export class GetAdminDoctorRequestUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRequestRepository) private readonly requests: DoctorRequestRepository,
  ) {}

  async execute(id: string): Promise<AdminDoctorRequest> {
    const row = await this.requests.findByIdWithPatient(this.prisma, id);
    if (!row) {
      throw new NotFoundError('DoctorRequest', id);
    }
    return toAdminDoctorRequest(row);
  }
}
