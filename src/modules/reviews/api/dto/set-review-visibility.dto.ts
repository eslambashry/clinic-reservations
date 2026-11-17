import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetReviewVisibilityDto {
  @ApiProperty({ description: 'true hides the review from public lists and rating aggregates; false restores it' })
  @IsBoolean()
  hidden: boolean;
}
