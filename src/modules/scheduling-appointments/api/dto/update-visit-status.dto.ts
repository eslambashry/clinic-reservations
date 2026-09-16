import { ApiProperty } from '@nestjs/swagger';
import { VisitStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, Min } from 'class-validator';

export class UpdateVisitStatusDto {
  @ApiProperty({ enum: VisitStatus, example: VisitStatus.IN_DOCTOR_ROOM })
  @IsEnum(VisitStatus)
  status!: VisitStatus;

  @ApiProperty({ minimum: 1, description: 'Appointment version returned by the latest list/detail read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
