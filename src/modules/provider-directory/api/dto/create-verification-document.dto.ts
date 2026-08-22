import { ApiProperty } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';
import { IsEnum, IsString, IsUUID, IsUrl } from 'class-validator';

/** File 12 Part 32.7: `fileUrl` is pre-hosted — no upload flow in this phase. */
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

  @ApiProperty({ example: 'https://storage.example.com/docs/license-123.pdf' })
  @IsUrl()
  fileUrl: string;
}
