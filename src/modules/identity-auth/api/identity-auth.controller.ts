import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Public } from '../../../shared/core/auth/public.decorator';
import { GetCurrentUserResult, GetCurrentUserUseCase } from '../application/get-current-user.use-case';
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
    @Inject(GetCurrentUserUseCase) private readonly getCurrentUser: GetCurrentUserUseCase,
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

  @Get('me')
  me(@CurrentUser() payload: AccessTokenPayload): Promise<GetCurrentUserResult> {
    return this.getCurrentUser.execute({ userId: payload.sub, activeRoleCode: payload.roleCode });
  }
}
