import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectWithdrawalDto {
  @ApiProperty({ example: 'بيانات الحساب غير صحيحة' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
