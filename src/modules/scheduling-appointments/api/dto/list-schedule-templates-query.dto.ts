import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ListScheduleTemplatesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  affiliationId: string;
}
