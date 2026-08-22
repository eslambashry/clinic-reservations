import { SetMetadata } from '@nestjs/common';
import { RoleContextType } from '@prisma/client';

export const ROLES_KEY = 'roleContexts';

/**
 * Gates an endpoint to one or more `role_memberships.context_type` values
 * (File 11 07.1's "one active role_membership context at a time"). Coarser
 * than `@Permissions()` — use this for "doctor-only endpoint" style checks;
 * use `@Permissions()` for fine-grained action checks within a context.
 */
export const Roles = (...contexts: RoleContextType[]) => SetMetadata(ROLES_KEY, contexts);
