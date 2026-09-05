import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CollectionType } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * `POST /lab-orders`, `PATIENT`-role. Either `testCodes` (direct catalog
 * selection) or `prescriptionId` (an uploaded referral image/file — purely
 * informational input for lab staff's own price+ETA judgment call, not a
 * drug-style prescription needing item-by-item transcription; File 12 Part
 * 50) must be present — enforced in `CreateLabOrderUseCase`, not here (a
 * cross-field rule, not a per-field one).
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
