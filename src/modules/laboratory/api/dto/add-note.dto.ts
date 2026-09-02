import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AddNoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  body: string;
}
