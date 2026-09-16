import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

/**
 * `display_name` (snake_case) matches the assistant/staff contract shape
 * already shipped for `CLINIC_STAFF` — same scoped snake_case exception as
 * `CreateAssistantDto`, not the File 12 Part 09 camelCase convention.
 */
export class CreateLabStaffDto {
  @ApiProperty({ example: '+201001234567' })
  @Matches(EGYPT_E164_PATTERN, { message: 'phone must be a valid Egyptian mobile number, e.g. +201001234567' })
  phone: string;

  @ApiProperty({ example: 'Sara Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  display_name: string;

  @ApiPropertyOptional({ example: 'Lab manager' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Sample intake & results' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  /** Optional only when the laboratory has exactly one branch — otherwise the account cannot be scoped unambiguously. */
  @ApiPropertyOptional({ example: 'b1a2c3d4-0000-4000-8000-000000000001' })
  @IsOptional()
  @IsUUID('4')
  lab_branch_id?: string;
}
