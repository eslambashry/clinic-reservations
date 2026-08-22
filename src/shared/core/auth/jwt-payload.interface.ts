import { RoleContextType } from '@prisma/client';

/**
 * Access-token claims (File 11 Part 07.1: "carrying `userId` + active
 * `role_membership` context"). `permissions` is resolved once at token
 * issuance from `role_permissions` (Identity module, Phase 1) and embedded
 * here — File 11 doesn't state whether permission checks are DB-backed or
 * claims-based; embedding them is the deliberate choice (File 12 Part 07)
 * so `RbacGuard` never needs a database round trip, and so `shared/core`
 * never has to reach into Identity's tables to authorize a request.
 */
export interface AccessTokenPayload {
  /** `users.id` */
  sub: string;
  roleMembershipId: string;
  roleCode: string;
  contextType: RoleContextType;
  permissions: string[];
}
