import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartAnalysisDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: "From the local technician roster the dashboard keeps client-side — folded into the audit detail text, never used as the recorded actor (see StartAnalysisUseCase)." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  technicianName?: string;
}
