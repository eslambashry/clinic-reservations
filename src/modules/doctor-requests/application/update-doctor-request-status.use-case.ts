import { Inject, Injectable } from '@nestjs/common';
import { DoctorRequestStatus } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { OutboxService } from '../../../shared/core/outbox/outbox.service';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { canTransition } from '../domain/doctor-request.rules';
import { DoctorRequestRepository } from '../infrastructure/doctor-request.repository';

/** Admin moves a request along; the patient is told (push + inbox) in the same transaction. */
@Injectable()
export class UpdateDoctorRequestStatusUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DoctorRequestRepository) private readonly requests: DoctorRequestRepository,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async execute(id: string, status: DoctorRequestStatus, adminNote?: string): Promise<{ id: string; status: string }> {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.requests.findById(tx, id);
      if (!row) {
        throw new NotFoundError('DoctorRequest', id);
      }
      if (!canTransition(row.status, status)) {
        throw new BusinessRuleError('DOCTOR_REQUEST_INVALID_TRANSITION', 'لا يمكن تغيير حالة هذا الطلب.', {
          from: row.status,
          to: status,
        });
      }
      const note = adminNote === undefined ? undefined : adminNote.trim() || null;
      await this.requests.setStatus(tx, id, row.version, status, note);
      await this.outbox.emit(tx, 'DoctorRequestStatusChanged', {
        patientId: row.patient_id,
        doctorRequestId: id,
        status,
        doctorName: row.doctor_name,
      });
    });
    return { id, status };
  }
}
