import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectDoctorDto {
  @ApiProperty({ example: 'LICENSE_INFORMATION_INCOMPLETE' })
  @IsString()
  @MinLength(1)
  reasonCode: string;
}
