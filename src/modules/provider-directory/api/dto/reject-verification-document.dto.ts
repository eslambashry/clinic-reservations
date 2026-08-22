import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectVerificationDocumentDto {
  @ApiProperty({ example: 'ILLEGIBLE_SCAN' })
  @IsString()
  @MinLength(1)
  reasonCode: string;
}
