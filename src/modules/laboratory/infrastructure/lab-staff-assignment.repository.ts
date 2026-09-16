import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface LabStaffAssignmentRow {
  roleMembershipId: string;
  userId: string;
  labBranchId: string;
}

/**
 * Backs `LabStaffAssignment` — the FK-verified mirror of the `LAB_STAFF`
 * `RoleMembership` whose `context_id` is the `LabBranch` id. Exactly one row
 * per membership (a lab account is scoped to a single branch), unlike
 * `ClinicStaffAssignment`'s many-branches-per-assistant shape.
 */
@Injectable()
export class LabStaffAssignmentRepository {
  /** Serialize the one-active-staff-per-laboratory check and write. */
  async acquireProvisioningLock(db: Prisma.TransactionClient, laboratoryId: string): Promise<void> {
    await db.$queryRaw<Array<{ lock: string }>>(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`lab-staff:${laboratoryId}`}, 0))::text AS lock`,
    );
  }

  async create(
    db: Prisma.TransactionClient,
    input: { userId: string; labBranchId: string; roleMembershipId: string },
  ): Promise<void> {
    await db.labStaffAssignment.upsert({
      where: { role_membership_id: input.roleMembershipId },
      create: {
        user_id: input.userId,
        lab_branch_id: input.labBranchId,
        role_membership_id: input.roleMembershipId,
      },
      update: { user_id: input.userId, lab_branch_id: input.labBranchId },
    });
  }

  /** Every staff assignment across one laboratory's branches, active memberships only. */
  findActiveByLaboratoryId(db: Prisma.TransactionClient, laboratoryId: string): Promise<LabStaffAssignmentRow[]> {
    return db.labStaffAssignment
      .findMany({
        where: { lab_branch: { laboratory_id: laboratoryId }, role_membership: { status: 'ACTIVE' } },
        select: { role_membership_id: true, user_id: true, lab_branch_id: true },
      })
      .then((rows) =>
        rows.map((row) => ({
          roleMembershipId: row.role_membership_id,
          userId: row.user_id,
          labBranchId: row.lab_branch_id,
        })),
      );
  }

  /**
   * Ownership-scoped lookup (IDOR prevention, same convention as
   * `findByIdForContext`): the branch id only comes back when the membership
   * really belongs to a branch of *this* laboratory, so a staff id from
   * another laboratory resolves to `null` — a 404 upstream, never a 403 that
   * would confirm the id exists at all.
   */
  findBranchIdForLaboratory(
    db: Prisma.TransactionClient,
    params: { roleMembershipId: string; laboratoryId: string },
  ): Promise<string | null> {
    return db.labStaffAssignment
      .findFirst({
        where: {
          role_membership_id: params.roleMembershipId,
          lab_branch: { laboratory_id: params.laboratoryId },
        },
        select: { lab_branch_id: true },
      })
      .then((row) => row?.lab_branch_id ?? null);
  }

  async deleteByRoleMembershipId(db: Prisma.TransactionClient, roleMembershipId: string): Promise<void> {
    await db.labStaffAssignment.deleteMany({ where: { role_membership_id: roleMembershipId } });
  }
}
