import { Inject, Injectable } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';
import { ListStaffByContextUseCase } from '../../identity-auth/application/list-staff-by-context.use-case';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AssistantResponse, toAssistantResponse } from '../domain/assistant-response.util';
import { DoctorRepository } from '../infrastructure/doctor.repository';

const ASSISTANT_ROLE_CODE = 'CLINIC_STAFF';

/** `GET /v1/provider/assistants` — only the calling doctor's own clinic assistants (`RoleMembership.context_id = Doctor.id`), never another doctor's. */
@Injectable()
export class ListAssistantsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(ListStaffByContextUseCase) private readonly listStaff: ListStaffByContextUseCase,
  ) {}

  async execute(actor: AccessTokenPayload): Promise<AssistantResponse[]> {
    const doctor = await this.doctors.findByUserId(this.prisma, actor.sub);
    if (!doctor) {
      throw new NotFoundError('Doctor', actor.sub);
    }

    const staff = await this.listStaff.execute({
      roleCode: ASSISTANT_ROLE_CODE,
      contextType: RoleContextType.CLINIC_STAFF,
      contextId: doctor.id,
    });

    return staff.map(toAssistantResponse);
  }
}
