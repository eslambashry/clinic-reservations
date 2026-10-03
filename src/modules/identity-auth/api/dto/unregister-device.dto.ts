import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterDeviceDto {
  @ApiProperty({ description: 'The current FCM registration token; sent in the body to keep it out of URL logs.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  fcmToken: string;
}
