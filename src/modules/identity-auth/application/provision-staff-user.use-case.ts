import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from '@node-rs/argon2';
import { Prisma, RoleContextType, RoleMembership, UserStatus } from '@prisma/client';
import { ConflictError } from '../../../shared/core/errors/domain-errors';
import { generateStaffPassword } from '../domain/staff-password.util';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';
import { UserRepository } from '../infrastructure/user.repository';

export interface ProvisionStaffUserInput {
  phone: string;
  displayName: string;
  roleCode: string;
  contextType: RoleContextType;
  contextId: string;
}

export interface ProvisionStaffUserResult {
  userId: string;
  roleMembershipId: string;
  phone: string;
  displayName: string;
  status: UserStatus;
  createdAt: Date;
  generatedPassword: string;
}

/**
 * Generic staff-provisioning primitive: find-or-create the `User` row for a
 * phone number, generate+hash a one-time password, and create (or
 * reactivate, if previously revoked) the owner-scoped `RoleMembership`. Not
 * named after "assistant"/doctor deliberately — same "contextType-
 * parameterized, reusable by any future owner-scoped staff flow" precedent
 * as `GetActiveRoleMembershipUseCase` (File 12 Part 39); `provider-directory`'s
 * `CreateAssistantUseCase` is just its first caller, passing
 * roleCode/contextType='CLINIC_STAFF' and contextId=the doctor's id.
 *
 * Deliberately conservative about reusing an existing `User` row (identity
 * is decoupled from role-context — File 10's DEC table — so the *same*
 * phone legitimately holding a PATIENT membership elsewhere is expected):
 * a brand-new phone (or one with no `password_hash` yet — an OTP-only
 * shell) is fine to reuse, and re-provisioning this exact owner's own
 * previously-revoked staff member is fine to overwrite (that password_hash
 * was set by this same flow originally). Anything else — a phone that's
 * already password-protected under an unrelated account — is rejected;
 * silently overwriting a stranger's password via this endpoint would be an
 * account-takeover path, not a "safe upsert."
 *
 * Takes `tx` explicitly (same pattern as `GrantRoleMembershipUseCase`) so
 * the caller's own transaction (which typically also writes an audit log
 * entry and resolves the owning entity) commits atomically with this.
 */
@Injectable()
export class ProvisionStaffUserUseCase {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
  ) {}

  async execute(tx: Prisma.TransactionClient, input: ProvisionStaffUserInput): Promise<ProvisionStaffUserResult> {
    let user = await this.users.findByPhone(tx, input.phone);
    let existingMembership: RoleMembership | null = null;

    if (user) {
      existingMembership = await this.roleMemberships.findByUserRoleContext(tx, {
        userId: user.id,
        roleCode: input.roleCode,
        contextType: input.contextType,
        contextId: input.contextId,
      });

      if (existingMembership?.status === 'ACTIVE') {
        throw new ConflictError('STAFF_ALREADY_PROVISIONED', 'رقم الهاتف مُضاف بالفعل إلى فريق هذه الجهة.', {
          phone: input.phone,
        });
      }

      const activeElsewhere = await this.roleMemberships.findActiveByUserRoleContextType(tx, {
        userId: user.id,
        roleCode: input.roleCode,
        contextType: input.contextType,
      });
      if (activeElsewhere.some((m) => m.context_id !== input.contextId)) {
        throw new ConflictError(
          'STAFF_ASSIGNED_ELSEWHERE',
          'رقم الهاتف مرتبط بفريق جهة أخرى.',
          { phone: input.phone },
        );
      }

      // Only a stranger-account risk the first time this phone is provisioned
      // for this owner. `existingMembership` (REVOKED) means this user IS the
      // assistant being reactivated — we set that password_hash ourselves on
      // the original provisioning, so overwriting it now is expected, not an
      // account-takeover path.
      if (!existingMembership && user.password_hash) {
        throw new ConflictError('PHONE_ALREADY_REGISTERED', 'رقم الهاتف مسجّل بالفعل في حساب آخر.', {
          phone: input.phone,
        });
      }
    } else {
      user = await this.users.create(tx, input.phone, input.displayName);
    }

    const generatedPassword = generateStaffPassword();
    const passwordHash = await argon2.hash(generatedPassword);
    user = await this.users.setPassword(tx, user.id, passwordHash);
    user = await this.users.updateProfile(tx, user.id, { firstName: input.displayName });
    // A reactivation (previously revoked, then re-provisioned) may be
    // reusing a user left SUSPENDED by an earlier `PATCH .../status`
    // before it was revoked — a fresh provisioning must always come back
    // usable, so status resets to ACTIVE regardless of its prior value.
    if (user.status !== 'ACTIVE') {
      user = await this.users.setStatus(tx, user.id, 'ACTIVE');
    }

    let membership;
    if (existingMembership) {
      // Reactivating a previously revoked assistant — update, not insert,
      // so the unique constraint on (user, role, contextType, contextId)
      // is never hit for a legitimate re-provision.
      await this.roleMemberships.setStatus(tx, existingMembership.id, existingMembership.version, 'ACTIVE');
      membership = existingMembership;
    } else {
      membership = await this.createMembership(tx, user.id, input);
    }

    return {
      userId: user.id,
      roleMembershipId: membership.id,
      phone: user.phone,
      displayName: user.first_name ?? input.displayName,
      status: user.status,
      createdAt: membership.created_at,
      generatedPassword,
    };
  }

  /** Isolated so a race that slips past the pre-checks above (two concurrent creates for the same phone) surfaces as the same conflict, backed by the DB unique constraint, instead of a raw P2002. */
  private async createMembership(tx: Prisma.TransactionClient, userId: string, input: ProvisionStaffUserInput) {
    try {
      return await this.roleMemberships.create(tx, {
        userId,
        roleCode: input.roleCode,
        contextType: input.contextType,
        contextId: input.contextId,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('STAFF_ALREADY_PROVISIONED', 'رقم الهاتف مُضاف بالفعل إلى فريق هذه الجهة.', {
          phone: input.phone,
        });
      }
      throw error;
    }
  }
}
