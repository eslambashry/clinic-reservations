import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Doctor.photo_url — a `data:<mime>;base64,<payload>` string (jpeg/png, max size per MEDIA_CONSTANTS.MAX_IMAGE_SIZE_BYTES), uploaded to ImageKit and persisted. Same upload path as SubmitProviderRegistrationDto.photo_data_uri.',
  })
  @IsOptional()
  @IsString()
  photo_data_uri?: string;
}
