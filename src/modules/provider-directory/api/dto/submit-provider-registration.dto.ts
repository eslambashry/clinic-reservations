import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One `working_days` entry — mirrors `CreateScheduleTemplateDto`'s
 * `weekday`/`startTime`/`endTime`/`slotDurationMinutes`/`bufferMinutes`
 * shape/validators exactly (`doctorClinicAffiliationId` is supplied by
 * `SelfRegisterProviderUseCase` from the affiliation it just created, not by
 * the client).
 */
export class WorkingDayDto {
  @ApiProperty({ minimum: 1, maximum: 7, description: 'ISO-8601 weekday, 1=Monday…7=Sunday' })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ example: '09:00' })
  @Matches(HH_MM)
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @Matches(HH_MM)
  endTime: string;

  @ApiProperty({ minimum: 5, maximum: 240 })
  @IsInt()
  @Min(5)
  @Max(240)
  slotDurationMinutes: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 120, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMinutes: number = 0;
}

/**
 * ADR-005 (`docs/decisions/ADR-005-PROVIDER-SELF-REGISTRATION.md`, FILE_12 Part 34):
 * property names are deliberately `snake_case` — a scoped exception to Part
 * 09's `camelCase` API convention — to match the request body the Flutter
 * `provider_registration` feature already sends. Part 34.2 persists
 * `full_name`/`degree`/`email`/`experience_years`/`bio`; a later pass (DEC-009
 * resolved via ImageKit) added `photo_data_uri` to that list too. `working_days`
 * is now persisted too — see `WorkingDayDto` and `SelfRegisterProviderUseCase`.
 * The remaining optional fields below (`specialty_label`/`documents`/
 * `city_label`) still have no persisted destination and stay declared (and
 * `@IsOptional()`) purely so the global `forbidNonWhitelisted` ValidationPipe
 * doesn't reject the frontend's existing payload — `SelfRegisterProviderUseCase`
 * never reads them, and the response's `notPersisted` array names every one of
 * them back explicitly.
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

  @ApiPropertyOptional({ description: 'Split into User.first_name/last_name on the first whitespace (ADR-005 Part 34.2)' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ description: 'Display-only label for `specialty`; not persisted' })
  @IsOptional()
  @IsString()
  specialty_label?: string;

  @ApiPropertyOptional({ description: 'Doctor.degree (ADR-005 Part 34.2)' })
  @IsOptional()
  @IsString()
  degree?: string;

  @ApiPropertyOptional({ description: 'User.email — best-effort; a conflict with an existing account\'s email is swallowed rather than failing registration (ADR-005 Part 34.2)' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Doctor.photo_url — a `data:<mime>;base64,<payload>` string (jpeg/png, max 8MB), uploaded to ImageKit and persisted (ADR-005, superseded: DEC-009 resolved)' })
  @IsOptional()
  @IsString()
  photo_data_uri?: string;

  @ApiPropertyOptional({ description: 'Doctor.experience_years (ADR-005 Part 34.2)' })
  @IsOptional()
  @IsNumber()
  experience_years?: number;

  @ApiPropertyOptional({ description: 'Doctor.bio (ADR-005 Part 34.2)' })
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

  @ApiPropertyOptional({
    type: [WorkingDayDto],
    description: 'Persisted as real ScheduleTemplate rows tied to the affiliation created by this registration (ADR-005).',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingDayDto)
  working_days?: WorkingDayDto[];
}
