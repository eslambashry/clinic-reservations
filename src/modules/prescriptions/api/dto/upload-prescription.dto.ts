import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * File 10 §2.3: max 5 files per prescription (`MEDIA_CONSTANTS.PRESCRIPTION_MAX_FILES`,
 * enforced by the controller's `FilesInterceptor` + `assertValidMediaFiles`,
 * unchanged from the pre-ImageKit implementation). Files themselves arrive as
 * `multipart/form-data` (`@UploadedFiles()` in the controller) — this DTO only
 * covers the remaining text field.
 */
export class UploadPrescriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
