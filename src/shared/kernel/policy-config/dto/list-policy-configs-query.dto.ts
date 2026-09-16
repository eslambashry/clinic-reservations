import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListPolicyConfigsQueryDto {
  @ApiPropertyOptional({ example: 'EG', description: 'Defaults to the single-region MVP code (File 11 Part 01)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  regionCode?: string;
}
