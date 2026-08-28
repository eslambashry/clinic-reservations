import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/** File 10 §2.3: max 5 files per prescription. File 12 Part 37.2: fileUrls are pre-hosted (no real multipart upload — object storage is DEC-009-gated/deferred, same pattern as ProviderVerificationDocument.file_url). */
export class UploadPrescriptionDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 5 })
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  fileUrls: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
