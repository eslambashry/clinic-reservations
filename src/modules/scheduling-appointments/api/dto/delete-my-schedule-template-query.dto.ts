import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * File 12 Part 49.6 — the optimistic-lock token for a delete, carried as a
 * query DTO rather than a bare `@Query('version', ParseIntPipe)`: an absent
 * scalar param still reaches `ParseIntPipe` as a non-nil value under this
 * app's global `ValidationPipe`, so the `optional: true` form 400s every
 * caller that omits it. A DTO with an optional field is the pattern every
 * other query surface here already uses, and it behaves correctly.
 */
export class DeleteMyScheduleTemplateQueryDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Version from the read this delete is based on; omit for last-write-wins.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}
