import { Inject, Injectable } from '@nestjs/common';
import { Prisma, RoleContextType, UserStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { RoleMembershipRepository } from '../infrastructure/role-membership.repository';

export interface ListStaffByContextInput {
  roleCode: string;
  contextType: RoleContextType;
  contextId: string;
}

export interface StaffMember {
  roleMembershipId: string;
  userId: string;
  phone: string;
  displayName: string | null;
  title: string | null;
  subtitle: string | null;
  /** Populated by the provider-directory caller (`ListAssistantsUseCase`) via `ClinicStaffAssignmentRepository` — this generic identity-auth use-case has no visibility into that provider-directory-owned table. */
  clinicBranchIds: string[];
  status: UserStatus;
  createdAt: Date;
}

/**
 * Owner-scoped staff listing (e.g. a doctor's clinic assistants). Read-only
 * callers use `PrismaService`; callers enforcing a read-before-write invariant
 * pass their transaction so the check shares the write's serialization scope.
 */
@Injectable()
export class ListStaffByContextUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RoleMembershipRepository) private readonly roleMemberships: RoleMembershipRepository,
  ) {}

  async execute(input: ListStaffByContextInput, db: Prisma.TransactionClient = this.prisma): Promise<StaffMember[]> {
    const memberships = await this.roleMemberships.listByContext(db, input);
    return memberships.map((m) => ({
      roleMembershipId: m.id,
      userId: m.user_id,
      phone: m.user.phone,
      displayName: m.user.first_name,
      title: m.title,
      subtitle: m.subtitle,
      clinicBranchIds: [],
      status: m.user.status,
      createdAt: m.created_at,
    }));
  }
}
