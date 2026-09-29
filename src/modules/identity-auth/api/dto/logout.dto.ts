import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LogoutDto {
  @IsString()
  @MinLength(20)
  refreshToken: string;

  @IsOptional()
  @IsBoolean()
  allDevices?: boolean = false;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  fcmToken?: string;
}
