import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Backs `ClinicStaffAssignment` — the CLINIC_STAFF sibling of
 * `PharmacyStaffAssignment`, except many-rows-per-membership (an assistant
 * can be assigned to several of the doctor's branches at once).
 */
@Injectable()
export class ClinicStaffAssignmentRepository {
  findClinicBranchIdsByRoleMembership(db: Prisma.TransactionClient, roleMembershipId: string): Promise<string[]> {
    return db.clinicStaffAssignment
      .findMany({ where: { role_membership_id: roleMembershipId }, select: { clinic_branch_id: true } })
      .then((rows) => rows.map((row) => row.clinic_branch_id));
  }

  findClinicBranchIdsByRoleMembershipIds(
    db: Prisma.TransactionClient,
    roleMembershipIds: string[],
  ): Promise<Map<string, string[]>> {
    return db.clinicStaffAssignment
      .findMany({ where: { role_membership_id: { in: roleMembershipIds } } })
      .then((rows) => {
        const map = new Map<string, string[]>();
        for (const row of rows) {
          const list = map.get(row.role_membership_id) ?? [];
          list.push(row.clinic_branch_id);
          map.set(row.role_membership_id, list);
        }
        return map;
      });
  }

  createMany(db: Prisma.TransactionClient, roleMembershipId: string, clinicBranchIds: string[]): Promise<Prisma.BatchPayload> {
    return db.clinicStaffAssignment.createMany({
      data: clinicBranchIds.map((clinicBranchId) => ({
        role_membership_id: roleMembershipId,
        clinic_branch_id: clinicBranchId,
      })),
    });
  }

  /** Full replace: used by both create (first assignment) and update (re-assign). */
  async replaceForRoleMembership(
    db: Prisma.TransactionClient,
    roleMembershipId: string,
    clinicBranchIds: string[],
  ): Promise<void> {
    await db.clinicStaffAssignment.deleteMany({ where: { role_membership_id: roleMembershipId } });
    if (clinicBranchIds.length > 0) {
      await this.createMany(db, roleMembershipId, clinicBranchIds);
    }
  }
}
