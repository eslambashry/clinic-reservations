import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class RecordResultDto {
  @ApiProperty()
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Registration-only file reference — real storage vendor undecided (File 10 uploads rule).' })
  @IsString()
  @MaxLength(255)
  fileLabel: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  sizeKb: number;
}
