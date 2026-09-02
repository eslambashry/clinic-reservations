import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Shared optional body for `arrival`/`dispatch-courier`/`collect-sample` — mirrors `LifecycleTransitionDto`'s role for pharmacy. */
export class LifecycleNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
