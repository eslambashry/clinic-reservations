import { StaffMember } from '../../identity-auth/application/list-staff-by-context.use-case';
import { ProvisionStaffUserResult } from '../../identity-auth/application/provision-staff-user.use-case';

/**
 * Flutter contract shape (`med-super/docs/assistant_feature_backend_integration.md`):
 * snake_case, exactly these fields — the frontend's `AssistantDto`/
 * `ProvisionedAssistantDto` also fall back to camelCase, but snake_case is
 * the documented contract and what `POST /v1/provider/assistants` etc. send.
 */
export interface AssistantResponse {
  id: string;
  phone: string;
  display_name: string;
  title: string | null;
  subtitle: string | null;
  clinic_branch_ids: string[];
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
  generated_password?: string;
}

export interface ProvisionedAssistantResponse extends AssistantResponse {
  generated_password: string;
}

export function toAssistantResponse(staff: StaffMember): AssistantResponse {
  return {
    id: staff.roleMembershipId,
    phone: staff.phone,
    display_name: staff.displayName ?? '',
    title: staff.title,
    subtitle: staff.subtitle,
    clinic_branch_ids: staff.clinicBranchIds,
    status: staff.status,
    created_at: staff.createdAt.toISOString(),
  };
}

export function withGeneratedPassword(response: AssistantResponse, password?: string): AssistantResponse {
  return password === undefined ? response : { ...response, generated_password: password };
}

export function toProvisionedAssistantResponse(result: ProvisionStaffUserResult): ProvisionedAssistantResponse {
  return {
    id: result.roleMembershipId,
    phone: result.phone,
    display_name: result.displayName,
    title: result.title ?? null,
    subtitle: result.subtitle ?? null,
    clinic_branch_ids: result.clinicBranchIds ?? [],
    status: result.status,
    created_at: result.createdAt.toISOString(),
    generated_password: result.generatedPassword,
  };
}
