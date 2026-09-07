import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** File 10 §2.3: "E.164 format, validated by regex server-side" — restricted to Egyptian mobile numbers. */
const EGYPT_E164_PATTERN = /^\+201[0125]\d{8}$/;

/**
 * `display_name` (snake_case) matches the Flutter `provider_dashboard`
 * feature's request body exactly — same scoped snake_case exception as
 * `UpdateMeDto`/`SubmitProviderRegistrationDto`, not the File 12 Part 09
 * camelCase convention.
 */
export class CreateAssistantDto {
  @ApiProperty({ example: '+201001234567' })
  @Matches(EGYPT_E164_PATTERN, { message: 'phone must be a valid Egyptian mobile number, e.g. +201001234567' })
  phone: string;

  @ApiProperty({ example: 'Sara Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  display_name: string;

  @ApiPropertyOptional({ example: 'Front desk' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Reception & check-in' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @ApiProperty({ example: ['b1a2c3d4-0000-4000-8000-000000000001'], type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  clinic_branch_ids: string[];
}
