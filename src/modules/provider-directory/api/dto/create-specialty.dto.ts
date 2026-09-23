import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * `code` is not accepted: it is a database-generated UUID, like every other
 * primary key in the schema.
 */
export class CreateSpecialtyDto {
  @ApiProperty({ example: 'أمراض القلب' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name_ar: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Parent specialty code; omit for a top-level specialty.',
  })
  @IsOptional()
  @IsUUID()
  parent_code?: string;
}
