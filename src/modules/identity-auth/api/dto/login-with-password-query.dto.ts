import { RoleContextType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';

export class LoginWithPasswordQueryDto {
  @IsOptional()
  @IsEnum(RoleContextType)
  @IsIn([RoleContextType.PATIENT, RoleContextType.DOCTOR, RoleContextType.CLINIC_STAFF], {
    message: 'role must be PATIENT, DOCTOR, or CLINIC_STAFF for this login screen.',
  })
  role?: RoleContextType;
}