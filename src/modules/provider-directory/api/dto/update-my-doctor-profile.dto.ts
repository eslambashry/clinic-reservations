import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * File 12 Part 45: `photoUrl` is intentionally not a field here — no
 * object-storage decision exists yet for doctor photos (same gap as
 * `ProviderVerificationDocument.file_url`/prescription uploads). Add it
 * once that decision is made; don't accept-and-drop it in the meantime.
 */
export class UpdateMyDoctorProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  degree?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  experienceYears?: number;
}
