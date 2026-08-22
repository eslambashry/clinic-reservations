/**
 * File 11 Part 03: "A provider is invisible in search until `status =
 * VERIFIED` (manual review)." File 12 Part 32.2 extends this into a full
 * visibility chain for a doctor reached *through* a specific clinic branch:
 * the doctor, the affiliation linking them to that branch, the branch
 * itself, and the branch's parent clinic must all independently be in good
 * standing — a `VERIFIED` doctor at a `SUSPENDED` branch is still invisible
 * via that branch.
 *
 * Framework-free (File 12 Part 05): no Prisma/HTTP imports, plain shape
 * types only, so this is testable without a database.
 */

export interface VisibleDoctorInput {
  status: 'PENDING' | 'VERIFIED' | 'SUSPENDED';
  deletedAt: Date | null;
}

export interface VisibleAffiliationInput {
  status: 'ACTIVE' | 'PAUSED';
}

export interface VisibleBranchInput {
  status: 'PENDING' | 'VERIFIED' | 'SUSPENDED';
}

export interface VisibleClinicOrPharmacyInput {
  status: 'PENDING' | 'VERIFIED' | 'SUSPENDED';
  deletedAt: Date | null;
}

/** Whether a Doctor/Clinic/Pharmacy top-level entity is independently visible. */
export function isProviderEntityVisible(entity: VisibleDoctorInput | VisibleClinicOrPharmacyInput): boolean {
  return entity.status === 'VERIFIED' && entity.deletedAt === null;
}

/** Whether a physical branch is independently visible (decision #2 — no document requirement). */
export function isBranchVisible(branch: VisibleBranchInput): boolean {
  return branch.status === 'VERIFIED';
}

/**
 * The full chain that must hold for a doctor to be discoverable via one
 * specific `doctor_clinic_affiliation` (search results / doctor detail).
 */
export function isDoctorVisibleViaAffiliation(params: {
  doctor: VisibleDoctorInput;
  affiliation: VisibleAffiliationInput;
  branch: VisibleBranchInput;
  clinic: VisibleClinicOrPharmacyInput;
}): boolean {
  return (
    isProviderEntityVisible(params.doctor) &&
    params.affiliation.status === 'ACTIVE' &&
    isBranchVisible(params.branch) &&
    isProviderEntityVisible(params.clinic)
  );
}

/**
 * Whether an authenticated caller (if any) may bypass the visibility chain
 * to review a not-yet-visible provider — Admin only (File 11 07.3).
 */
export function canBypassVisibility(callerContextType: string | undefined): boolean {
  return callerContextType === 'ADMIN';
}
