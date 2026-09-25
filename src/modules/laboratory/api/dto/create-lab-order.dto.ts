import { ApiProperty } from '@nestjs/swagger';
import { CollectionType } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

/**
 * `POST /lab-orders`, `PATIENT`-role. The request must reference an uploaded
 * referral image/file for laboratory staff to review.
 */
export class CreateLabOrderDto {
  @ApiProperty()
  @IsUUID()
  labBranchId: string;

  @ApiProperty({ enum: CollectionType })
  @IsEnum(CollectionType)
  collectionType: CollectionType;

  @ApiProperty()
  @IsUUID()
  prescriptionId: string;
}
