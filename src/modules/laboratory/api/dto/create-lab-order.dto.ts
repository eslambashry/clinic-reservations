import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CollectionType } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * `POST /lab-orders`, `PATIENT`-role. Either `testCodes` (direct catalog
 * selection) or `prescriptionId` (uploaded prescription, "incomplete
 * request awaiting transcription" per Readiness Plan §E) must be present —
 * enforced in `CreateLabOrderUseCase`, not here (a cross-field rule, not a
 * per-field one).
 */
export class CreateLabOrderDto {
  @ApiProperty()
  @IsUUID()
  labBranchId: string;

  @ApiProperty({ enum: CollectionType })
  @IsEnum(CollectionType)
  collectionType: CollectionType;

  @ApiPropertyOptional({ type: [String], example: ['CBC', 'LIPID_PANEL'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  testCodes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  prescriptionId?: string;
}
