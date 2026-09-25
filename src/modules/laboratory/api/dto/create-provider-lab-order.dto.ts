import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CollectionType } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProviderLabOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  labBranchId: string;

  @ApiProperty({ enum: CollectionType })
  @IsEnum(CollectionType)
  collectionType: CollectionType;

  @ApiProperty({ format: 'uuid', description: 'Uploaded referral prescription belonging to the same patient.' })
  @IsUUID()
  prescriptionId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional appointment in the authenticated provider scope for this patient.' })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;
}

export class CreateProviderLabOrderBatchDto {
  @ApiProperty({ type: [CreateProviderLabOrderDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateProviderLabOrderDto)
  requests: CreateProviderLabOrderDto[];
}
