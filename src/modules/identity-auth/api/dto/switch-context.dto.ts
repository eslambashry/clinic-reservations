import { ApiProperty } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { IsEnum } from 'class-validator';

/**
 * Fixes the "most-recent-membership-wins" gap `RoleMembershipRepository`
 * flags inline (pass-1/pass-2 audit, S-2): a user with more than one
 * ACTIVE `role_membership` — e.g. a doctor who was self-registered as a
 * PATIENT first, then Admin-verified into DOCTOR — could only ever act as
 * whichever membership was granted most recently, with no way back. This
 * DTO names which of the caller's *own* active contexts to switch into;
 * `SwitchContextUseCase` re-checks that ownership server-side, this value
 * is never trusted as proof by itself.
 */
export class SwitchContextDto {
  @ApiProperty({ enum: RoleContextType })
  @IsEnum(RoleContextType)
  contextType: RoleContextType;
}
