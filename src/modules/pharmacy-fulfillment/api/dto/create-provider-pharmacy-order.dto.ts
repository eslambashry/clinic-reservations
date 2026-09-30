import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfillmentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsOptional, IsUUID } from 'class-validator';

export class CreateProviderPharmacyOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ format: 'uuid', description: 'Must be a signed DOCTOR_ISSUED prescription for this patient in the caller\'s doctor scope.' })
  @IsUUID()
  prescriptionId: string;

  @ApiProperty({ enum: ['PICKUP', 'DELIVERY', 'CLINIC_HANDOVER'] })
  @IsIn(['PICKUP', 'DELIVERY', 'CLINIC_HANDOVER'])
  fulfillmentType: FulfillmentType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Choose one verified branch, or provide coordinates to use the existing nearby-branch broadcast.' })
  @IsOptional()
  @IsUUID()
  pharmacyBranchId?: string;

  @ApiPropertyOptional({ example: 30.0444 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 31.2357 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}
