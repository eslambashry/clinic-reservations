import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Same scoped snake_case exception as `UpdateAssistantDto`. All fields
 * optional — a partial PATCH must stay valid. No `password` field: as on
 * create, a pharmacy staff password is only ever system-generated.
 */
export class UpdatePharmacyStaffDto {
  @ApiPropertyOptional({ example: 'Youssef Adel' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  display_name?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'Pharmacist' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Dispensing & counter' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;
}
