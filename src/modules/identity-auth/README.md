# identity-auth

**MVP** — owns `User`, `Role`, `Permission`, `RolePermission`, `RoleMembership`, `OtpRequest`, `RefreshToken`, `Device` (see `prisma/schema/identity.prisma`), per File 11 Part 03.

### Managed employee identities — approved 2026-10-03

Doctor-managed employees use a separate account from personal patient/doctor
identities. The shared rule also applies to branch-managed pharmacy and lab
staff: one staff role/context and one owner scope for the identity's entire
membership history, including revoked rows. A personal PATIENT + DOCTOR
account remains supported; it cannot be repurposed into a managed employee.

Provisioning creates a new identity or reactivates that exact owner's revoked
employee only. An existing OTP-only patient phone, an empty account with no
proof of employee ownership, another owner's staff account, or mixed personal
history is rejected before global password/name/status writes. Owner staff
updates enforce the same historical identity boundary. The shared membership
writer rejects later role grants that would turn an owner-known staff password
into personal or other-owner access.

Token issuance and rotation acquire the existing per-user auth row lock and
recheck current ACTIVE/non-deleted identity, historical identity compatibility,
and the selected ACTIVE membership before signing or storing a refresh token.
Suspension uses that same lock and revokes all refresh tokens and registered
devices before its transaction returns. Password changes participate in the
same lock. Existing access JWTs are not globally revoked immediately: they
retain their configured TTL; staff scopes additionally recheck active identity.

Legacy mixed identities fail closed with `STAFF_IDENTITY_CONFLICT` during
issuance/rotation and owner credential mutations. They require explicit,
reviewed per-environment account separation and credential/session remediation.
Revoking one conflicting membership does not remove its historical ownership
meaning. No live data is rewritten by this policy or its test fixtures.
