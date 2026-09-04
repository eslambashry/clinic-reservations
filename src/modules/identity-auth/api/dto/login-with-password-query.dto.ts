import { RoleContextType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class LoginWithPasswordQueryDto {
  @IsOptional()
  @IsEnum(RoleContextType)
  role?: RoleContextType;
}