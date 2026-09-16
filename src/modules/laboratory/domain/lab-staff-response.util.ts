import { StaffMember } from '../../identity-auth/application/list-staff-by-context.use-case';
import { ProvisionStaffUserResult } from '../../identity-auth/application/provision-staff-user.use-case';

/**
 * Same snake_case staff contract shape already shipped for `CLINIC_STAFF`
 * (`provider-directory/domain/assistant-response.util.ts`), minus the
 * many-branches field: a lab account is scoped to exactly one `LabBranch`,
 * so it carries a single `lab_branch_id`.
 */
export interface LabStaffResponse {
  id: string;
  phone: string;
  display_name: string;
  title: string | null;
  subtitle: string | null;
  lab_branch_id: string;
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
  generated_password?: string;
}

export interface ProvisionedLabStaffResponse extends LabStaffResponse {
  generated_password: string;
}

export function toLabStaffResponse(staff: StaffMember, labBranchId: string): LabStaffResponse {
  return {
    id: staff.roleMembershipId,
    phone: staff.phone,
    display_name: staff.displayName ?? '',
    title: staff.title,
    subtitle: staff.subtitle,
    lab_branch_id: labBranchId,
    status: staff.status,
    created_at: staff.createdAt.toISOString(),
  };
}

export function withGeneratedPassword(response: LabStaffResponse, password?: string): LabStaffResponse {
  return password === undefined ? response : { ...response, generated_password: password };
}

export function toProvisionedLabStaffResponse(
  result: ProvisionStaffUserResult,
  labBranchId: string,
  title?: string,
  subtitle?: string,
): ProvisionedLabStaffResponse {
  return {
    id: result.roleMembershipId,
    phone: result.phone,
    display_name: result.displayName,
    title: title ?? null,
    subtitle: subtitle ?? null,
    lab_branch_id: labBranchId,
    status: result.status,
    created_at: result.createdAt.toISOString(),
    generated_password: result.generatedPassword,
  };
}
