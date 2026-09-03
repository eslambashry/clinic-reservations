import { Inject, Injectable } from '@nestjs/common';
import { Prisma, RoleContextType } from '@prisma/client';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';

export interface GrantRoleMembershipInput {
  userId: string;
  roleCode: string;
  contextType: RoleContextType;
}

/**
 * identity-auth's second cross-module write export (alongside
 * `UpdateUserProfileUseCase`) — same `tx: Prisma.TransactionClient` pattern,
 * so a caller like `VerifyDoctorUseCase` grants the membership atomically
 * with its own status write, never in a separate transaction.
 *
 * Added so a self-registered applicant (who only ever holds a PATIENT
 * membership per `VerifyOtpUseCase`'s Phase 1 scope — see that use-case's
 * doc comment) actually becomes a real DOCTOR once an Admin approves them.
 * Without this, `Doctor.status` could reach VERIFIED while the person's
 * JWT role stayed PATIENT forever, since nothing else in the system ever
 * grants a second role_membership.
 *
 * Idempotent: if the user already holds an ACTIVE membership with this
 * exact `roleCode`/`contextType` (e.g. re-verifying an already-VERIFIED
 * doctor, matching `VerifyDoctorUseCase`'s own idempotent-safe contract —
 * File 12 Part 32.13), this is a no-op rather than creating a duplicate row.
 *
 * Which membership becomes "active" at the next login when a user holds
 * more than one is genuinely unresolved by File 11 (flagged inline in
 * `verify-otp.use-case.ts`/`refresh-token.use-case.ts`) — this use-case
 * does not attempt to resolve that; `RoleMembershipRepository
 * .findActiveByUser` ordering (most-recent-first) is what currently decides
 * it, so simply granting the newest membership here is what makes it win.
 */
@Injectable()
export class GrantRoleMembershipUseCase {
  constructor(@Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository) {}

  async execute(tx: Prisma.TransactionClient, input: GrantRoleMembershipInput): Promise<void> {
    const existing = await this.roleMemberships.findActiveByUser(tx, input.userId);
    const alreadyGranted = existing.some(
      (m) => m.role_code === input.roleCode && m.context_type === input.contextType,
    );
    if (alreadyGranted) {
      return;
    }

    await this.roleMemberships.create(tx, {
      userId: input.userId,
      roleCode: input.roleCode,
      contextType: input.contextType,
    });
  }
}
