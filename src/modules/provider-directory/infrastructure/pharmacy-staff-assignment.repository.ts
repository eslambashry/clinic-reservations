import { Injectable } from '@nestjs/common';
import { PharmacyStaffAssignment, Prisma } from '@prisma/client';

/**
 * Backs `PharmacyStaffAssignment` — the FK-verified mirror of the
 * `PHARMACY_STAFF` `RoleMembership` (`role_membership_id` is unique, so this
 * is 1:1, unlike `ClinicStaffAssignment`'s many-per-membership shape). Status
 * is never read from here: the owning `RoleMembership` remains the single
 * source of truth for ACTIVE/REVOKED, exactly as `src/db/seed.ts` builds the
 * pairing.
 */
@Injectable()
export class PharmacyStaffAssignmentRepository {
  /** Serialize the one-active-staff-per-pharmacy check and write. */
  async acquireProvisioningLock(db: Prisma.TransactionClient, pharmacyId: string): Promise<void> {
    await db.$queryRaw<Array<{ lock: string }>>(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pharmacy-staff:${pharmacyId}`}, 0))::text AS lock`,
    );
  }

  create(
    db: Prisma.TransactionClient,
    input: { userId: string; pharmacyBranchId: string; roleMembershipId: string },
  ): Promise<PharmacyStaffAssignment> {
    return db.pharmacyStaffAssignment.upsert({
      where: { role_membership_id: input.roleMembershipId },
      update: { user_id: input.userId, pharmacy_branch_id: input.pharmacyBranchId },
      create: {
        user_id: input.userId,
        pharmacy_branch_id: input.pharmacyBranchId,
        role_membership_id: input.roleMembershipId,
      },
    });
  }

  findByRoleMembershipId(db: Prisma.TransactionClient, roleMembershipId: string): Promise<PharmacyStaffAssignment | null> {
    return db.pharmacyStaffAssignment.findUnique({ where: { role_membership_id: roleMembershipId } });
  }

  /**
   * The route is scoped to a pharmacy but the `RoleMembership` is scoped to a
   * branch, so the branch a staff id belongs to has to be resolved before an
   * ownership-scoped identity-auth call can run. Joining through this mirror
   * table's own `pharmacy_branch` FK keeps that resolution inside
   * provider-directory's own tables.
   */
  findBranchIdForPharmacy(
    db: Prisma.TransactionClient,
    params: { roleMembershipId: string; pharmacyId: string },
  ): Promise<string | null> {
    return db.pharmacyStaffAssignment
      .findFirst({
        where: {
          role_membership_id: params.roleMembershipId,
          pharmacy_branch: { pharmacy_id: params.pharmacyId },
        },
        select: { pharmacy_branch_id: true },
      })
      .then((row) => row?.pharmacy_branch_id ?? null);
  }
}
