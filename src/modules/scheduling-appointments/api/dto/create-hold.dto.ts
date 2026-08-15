import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** File 10 §2.3: `patientId` must equal the caller — validated in the use-case (403 otherwise), not here. */
export class CreateHoldDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  doctorClinicAffiliationId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  slotId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId: string;
}
