import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrescriptionDocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { UploadPrescriptionDto } from './upload-prescription.dto';

export class UploadProviderClinicalDocumentDto extends UploadPrescriptionDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty({ enum: PrescriptionDocumentType })
  @IsEnum(PrescriptionDocumentType)
  documentType!: PrescriptionDocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  appointmentId?: string;
}
