import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * File 12 Part 49.5: omitting `affiliationId` returns every affiliation the
 * caller owns. Supplying one only ever *narrows* that set — it can never
 * widen the scope, and an unowned id is a 404.
 */
export class ListMyScheduleTemplatesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  affiliationId?: string;
}
