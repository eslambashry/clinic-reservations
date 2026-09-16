import { RoleContextType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';

export class LoginWithPasswordQueryDto {
  @IsOptional()
  @IsEnum(RoleContextType)
  @IsIn([RoleContextType.PATIENT, RoleContextType.DOCTOR, RoleContextType.CLINIC_STAFF, RoleContextType.ADMIN], {
    message: 'role must be PATIENT, DOCTOR, CLINIC_STAFF, or ADMIN for this login screen.',
  })
  role?: RoleContextType;
}
