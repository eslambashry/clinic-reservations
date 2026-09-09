import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const PLATFORMS = ['ios', 'android'] as const;

/** File 12 Part 53 `POST /v1/auth/devices`. */
export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM registration token from the client SDK.' })
  @IsString()
  @MaxLength(500)
  fcmToken: string;

  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS)
  platform: (typeof PLATFORMS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;
}
