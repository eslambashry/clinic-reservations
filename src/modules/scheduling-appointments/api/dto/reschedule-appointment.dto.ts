import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** File 12 Part 35.11: `newSlotId` must belong to the same affiliation as the appointment being rescheduled — validated in the use-case, not here. */
export class RescheduleAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  newSlotId: string;
}
