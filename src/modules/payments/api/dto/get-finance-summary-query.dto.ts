import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class GetFinanceSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive lower bound on the split/refund creation time (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive upper bound on the split/refund creation time (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
