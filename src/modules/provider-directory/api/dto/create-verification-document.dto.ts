import { ApiProperty } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';
import { IsEnum, IsString, IsUUID } from 'class-validator';

/** File 12 Part 32.7 (superseded): the file itself arrives as `multipart/form-data` (`@UploadedFile()` in the controller) — this DTO only covers the accompanying text fields. */
export class CreateVerificationDocumentDto {
  @ApiProperty({ enum: ProviderType, example: 'DOCTOR' })
  @IsEnum(ProviderType)
  providerType: ProviderType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  providerId: string;

  @ApiProperty({ example: 'MEDICAL_LICENSE' })
  @IsString()
  docType: string;
}
