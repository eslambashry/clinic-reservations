import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class LogoutDto {
  @IsString()
  @MinLength(20)
  refreshToken: string;

  @IsOptional()
  @IsBoolean()
  allDevices?: boolean = false;
}
