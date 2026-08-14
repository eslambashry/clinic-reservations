import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * ADR-005 (`docs/decisions/ADR-005-PROVIDER-SELF-REGISTRATION.md`, FILE_12 Part 34):
 * property names are deliberately `snake_case` — a scoped exception to Part
 * 09's `camelCase` API convention — to match the request body the Flutter
 * `provider_registration` feature already sends. Fields with no persisted
 * destination are still declared (and `@IsOptional()`) purely so the global
 * `forbidNonWhitelisted` ValidationPipe doesn't reject the frontend's
 * existing payload; `SelfRegisterProviderUseCase` never reads them, and the
 * response's `not_persisted` array names every one of them back explicitly.
 */
export class SubmitProviderRegistrationDto {
  @ApiProperty({ description: 'Specialty.code — validated against the real specialties table' })
  @IsString()
  specialty: string;

  @ApiProperty({ description: 'Doctor.license_number — required; not yet collected by the current frontend form (ADR-005)' })
  @IsString()
  license_number: string;

  @ApiProperty({ description: 'Address.region_code — required; not yet collected by the current frontend form (ADR-005)' })
  @IsString()
  region_code: string;

  @ApiProperty({ description: 'Clinic.legal_name and Clinic.brand_name (both set to this value)' })
  @IsString()
  clinic_name: string;

  @ApiProperty({ description: 'Address.line1' })
  @IsString()
  clinic_address: string;

  @ApiProperty({ description: 'Address.city (free text)' })
  @IsString()
  city: string;

  @ApiProperty({ description: 'ClinicBranch.phone — interpreted as the branch contact phone, see ADR-005' })
  @IsString()
  phone: string;

  @ApiProperty({ description: 'DoctorClinicAffiliation.consult_fee' })
  @IsNumber()
  consultation_fee: number;

  // --- Accepted for forward-compatibility with the shipped frontend payload; NOT persisted (ADR-005). ---

  @ApiPropertyOptional({ description: 'Not persisted — Doctor has no name column (ADR-005)' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ description: 'Display-only label for `specialty`; not persisted' })
  @IsOptional()
  @IsString()
  specialty_label?: string;

  @ApiPropertyOptional({ description: 'Not persisted — no schema column exists yet (ADR-005)' })
  @IsOptional()
  @IsString()
  degree?: string;

  @ApiPropertyOptional({ description: 'Not persisted — no verified profile-update path exists yet (ADR-005)' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Not persisted — Doctor.photo_url is a pre-hosted URL field, no upload flow yet (ADR-005)' })
  @IsOptional()
  @IsString()
  photo_data_uri?: string;

  @ApiPropertyOptional({ description: 'Not persisted — no schema column exists yet (ADR-005)' })
  @IsOptional()
  @IsNumber()
  experience_years?: number;

  @ApiPropertyOptional({ description: 'Not persisted — no schema column exists yet (ADR-005)' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Not persisted — verification document upload stays Admin-only (ADR-005, Part 32.7)' })
  @IsOptional()
  @IsArray()
  documents?: string[];

  @ApiPropertyOptional({ description: 'Display-only label for `city`; not persisted' })
  @IsOptional()
  @IsString()
  city_label?: string;

  @ApiPropertyOptional({ description: 'Not persisted — real ScheduleTemplate creation stays Admin-only (ADR-005, Part 33.1)' })
  @IsOptional()
  @IsArray()
  working_days?: unknown[];
}
