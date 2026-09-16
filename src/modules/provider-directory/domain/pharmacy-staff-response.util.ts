import { StaffMember } from '../../identity-auth/application/list-staff-by-context.use-case';
import { ProvisionStaffUserResult } from '../../identity-auth/application/provision-staff-user.use-case';

/**
 * Same snake_case contract shape as `AssistantResponse` (the dashboards read
 * both surfaces), minus `clinic_branch_ids`: a pharmacy staff account is
 * bound to exactly one `PharmacyBranch`, so the single `pharmacy_branch_id`
 * replaces the assistant's many-branch array.
 */
export interface PharmacyStaffResponse {
  id: string;
  phone: string;
  display_name: string;
  title: string | null;
  subtitle: string | null;
  pharmacy_branch_id: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
  generated_password?: string;
}

export interface ProvisionedPharmacyStaffResponse extends PharmacyStaffResponse {
  generated_password: string;
}

export function toPharmacyStaffResponse(staff: StaffMember, pharmacyBranchId: string | null): PharmacyStaffResponse {
  return {
    id: staff.roleMembershipId,
    phone: staff.phone,
    display_name: staff.displayName ?? '',
    title: staff.title,
    subtitle: staff.subtitle,
    pharmacy_branch_id: pharmacyBranchId,
    status: staff.status,
    created_at: staff.createdAt.toISOString(),
  };
}

export function toProvisionedPharmacyStaffResponse(
  result: ProvisionStaffUserResult,
  pharmacyBranchId: string,
): ProvisionedPharmacyStaffResponse {
  return {
    id: result.roleMembershipId,
    phone: result.phone,
    display_name: result.displayName,
    title: result.title ?? null,
    subtitle: result.subtitle ?? null,
    pharmacy_branch_id: pharmacyBranchId,
    status: result.status,
    created_at: result.createdAt.toISOString(),
    generated_password: result.generatedPassword,
  };
}
