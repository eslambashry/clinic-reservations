import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClinicStaffAssignmentRepository } from '../infrastructure/clinic-staff-assignment.repository';

/**
 * Notifications scoped to one branch (a new/cancelled/rescheduled
 * appointment) need the assistants working that specific branch, not every
 * assistant the doctor has across all their branches — an assistant only
 * assigned to branch A should never be notified about branch B's queue.
 */
@Injectable()
export class ListAssistantUserIdsForBranchUseCase {
  constructor(@Inject(ClinicStaffAssignmentRepository) private readonly assignments: ClinicStaffAssignmentRepository) {}

  execute(tx: Prisma.TransactionClient, clinicBranchId: string): Promise<string[]> {
    return this.assignments.findActiveUserIdsByClinicBranchId(tx, clinicBranchId);
  }
}
