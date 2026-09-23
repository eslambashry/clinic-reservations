import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CollectionType } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
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

  @ApiPropertyOptional({ type: [String], example: ['CBC', 'LIPID_PANEL'], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  testCodes?: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional referral prescription belonging to the same patient.' })
  @IsOptional()
  @IsUUID()
  prescriptionId?: string;

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
