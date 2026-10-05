/** Owner-managed employee credentials must never authenticate a personal identity. */
export interface IdentityMembership {
  role_code: string;
  context_type: string;
  context_id: string | null;
}

const MANAGED_STAFF_ROLES = new Set(['CLINIC_STAFF', 'PHARMACY_STAFF', 'LAB_STAFF']);

export function isManagedStaffMembership(membership: IdentityMembership): boolean {
  // Either representation identifies staff: malformed role/context combinations
  // must not evade the boundary by presenting themselves as a personal role.
  return MANAGED_STAFF_ROLES.has(membership.role_code) || MANAGED_STAFF_ROLES.has(membership.context_type);
}

function isValidStaffScope(membership: IdentityMembership): boolean {
  return MANAGED_STAFF_ROLES.has(membership.role_code) && membership.context_type === membership.role_code && !!membership.context_id;
}

function sameScope(left: IdentityMembership, right: IdentityMembership): boolean {
  return left.role_code === right.role_code && left.context_type === right.context_type && left.context_id === right.context_id;
}

/** All historical rows count, including REVOKED: revocation cannot launder an owner-known password. */
export function canOwnerManageIdentity(history: IdentityMembership[], target: IdentityMembership): boolean {
  return history.length > 0 && isValidStaffScope(target) && history.every((membership) => sameScope(membership, target));
}

export function hasStaffIdentityConflict(history: IdentityMembership[]): boolean {
  const staff = history.find(isManagedStaffMembership);
  return !!staff && !canOwnerManageIdentity(history, staff);
}

/** Personal PATIENT + DOCTOR identities remain legitimate; managed employees have one immutable owner scope. */
export function canAddIdentityMembership(history: IdentityMembership[], candidate: IdentityMembership): boolean {
  if (isManagedStaffMembership(candidate)) {
    return isValidStaffScope(candidate) && history.every((membership) => sameScope(membership, candidate));
  }
  return !history.some(isManagedStaffMembership);
}
