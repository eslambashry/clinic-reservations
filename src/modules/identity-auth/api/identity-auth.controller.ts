import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../../shared/core/auth/public.decorator';
import { LogoutUseCase } from '../application/logout.use-case';
import { RefreshTokenResult, RefreshTokenUseCase } from '../application/refresh-token.use-case';
import { RequestOtpResult, RequestOtpUseCase } from '../application/request-otp.use-case';
import { VerifyOtpResult, VerifyOtpUseCase } from '../application/verify-otp.use-case';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

/**
 * File 11 Part 05.1 / File 10 §2.3. Every route here is `@Public()` —
 * there's no access token to check yet (that's the point of auth) — and
 * `/token/refresh`/`/logout` authenticate via the refresh token in the
 * body instead, exactly as File 11 07.1 specifies (not the global
 * `JwtAuthGuard`'s bearer-header path).
 */
@Controller('auth')
export class IdentityAuthController {
  constructor(
    @Inject(RequestOtpUseCase) private readonly requestOtp: RequestOtpUseCase,
    @Inject(VerifyOtpUseCase) private readonly verifyOtp: VerifyOtpUseCase,
    @Inject(RefreshTokenUseCase) private readonly refreshToken: RefreshTokenUseCase,
    @Inject(LogoutUseCase) private readonly logout: LogoutUseCase,
  ) {}

  @Public()
  @Post('otp/request')
  request(@Body() dto: RequestOtpDto, @Req() req: Request): Promise<RequestOtpResult> {
    return this.requestOtp.execute({ phone: dto.phone, ip: req.ip });
  }

  @Public()
  @Post('otp/verify')
  verify(@Body() dto: VerifyOtpDto): Promise<VerifyOtpResult> {
    return this.verifyOtp.execute({ requestId: dto.requestId, code: dto.code });
  }

  @Public()
  @Post('token/refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<RefreshTokenResult> {
    return this.refreshToken.execute({ refreshToken: dto.refreshToken });
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async signOut(@Body() dto: LogoutDto): Promise<void> {
    await this.logout.execute({ refreshToken: dto.refreshToken, allDevices: dto.allDevices });
  }
}
