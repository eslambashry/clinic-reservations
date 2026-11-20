import { Inject, Injectable } from '@nestjs/common';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { BusinessRuleError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ListActiveAdminUserIdsUseCase } from '../../identity-auth/application/list-active-admin-user-ids.use-case';
import { hasAnyDetail, hasReachedOpenRequestLimit } from '../domain/doctor-request.rules';
import { DoctorRequestRepository } from '../infrastructure/doctor-request.repository';
import { MyDoctorRequest, toMyDoctorRequest } from './doctor-request.mapper';

export interface CreateDoctorRequestInput {
  doctorName?: string;
  clinicName?: string;
  location?: string;
  specialty?: string;
  contactPhone?: string;
  notes?: string;
}

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Patient asks for a doctor who is not on the platform; Admin is notified (one outbox event per admin). */
@Injectable()
export class CreateDoctorRequestUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRequestRepository) private readonly requests: DoctorRequestRepository,
    @Inject(ListActiveAdminUserIdsUseCase) private readonly listAdmins: ListActiveAdminUserIdsUseCase,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(input: CreateDoctorRequestInput, actor: AccessTokenPayload): Promise<MyDoctorRequest> {
    if (!hasAnyDetail(input)) {
      throw new BusinessRuleError('DOCTOR_REQUEST_EMPTY', 'أدخل معلومة واحدة على الأقل عن الدكتور.');
    }
    const adminUserIds = await this.listAdmins.execute();

    return this.prisma.$transaction(async (tx) => {
      if (hasReachedOpenRequestLimit(await this.requests.countOpenForPatient(tx, actor.sub))) {
        throw new BusinessRuleError('DOCTOR_REQUEST_LIMIT_REACHED', 'لديك طلبات مفتوحة كثيرة. انتظر مراجعتها قبل إرسال طلب جديد.');
      }
      const row = await this.requests.create(tx, {
        patientId: actor.sub,
        doctorName: clean(input.doctorName),
        clinicName: clean(input.clinicName),
        location: clean(input.location),
        specialty: clean(input.specialty),
        contactPhone: clean(input.contactPhone),
        notes: clean(input.notes),
      });
      for (const adminUserId of adminUserIds) {
        await this.outbox.emit(tx, 'NewDoctorRequestForAdmin', {
          adminUserId,
          doctorRequestId: row.id,
          patientId: actor.sub,
          doctorName: row.doctor_name,
          clinicName: row.clinic_name,
          specialty: row.specialty,
        });
      }
      return toMyDoctorRequest(row);
    });
  }
}
