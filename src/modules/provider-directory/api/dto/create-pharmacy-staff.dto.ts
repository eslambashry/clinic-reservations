import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** File 10 §2.3: "E.164 format, validated by regex server-side" — restricted to Egyptian mobile numbers. */
const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

/**
 * Same scoped snake_case exception as `CreateAssistantDto`. Deliberately has
 * no `password` field: the system generates the one-time password and returns
 * it once, so an Admin can never set a staff password from the request body.
 */
export class CreatePharmacyStaffDto {
  @ApiProperty({ example: '+201001234567' })
  @Matches(EGYPT_E164_PATTERN, { message: 'phone must be a valid Egyptian mobile number, e.g. +201001234567' })
  phone: string;

  @ApiProperty({ example: 'Youssef Adel' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  display_name: string;

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

  /** Optional only when the pharmacy has exactly one branch — otherwise the branch to bind this account to must be named explicitly. */
  @ApiPropertyOptional({ example: 'b1a2c3d4-0000-4000-8000-000000000001' })
  @IsOptional()
  @IsUUID('4')
  pharmacy_branch_id?: string;
}
