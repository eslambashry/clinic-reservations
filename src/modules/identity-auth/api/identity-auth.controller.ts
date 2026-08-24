import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Public } from '../../../shared/core/auth/public.decorator';
import { ForgotPasswordResult, ForgotPasswordUseCase } from '../application/forgot-password.use-case';
import { GetCurrentUserResult, GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import { LoginWithPasswordResult, LoginWithPasswordUseCase } from '../application/login-with-password.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { RefreshTokenResult, RefreshTokenUseCase } from '../application/refresh-token.use-case';
import { RequestOtpResult, RequestOtpUseCase } from '../application/request-otp.use-case';
import { ResetPasswordUseCase } from '../application/reset-password.use-case';
import { SetPasswordUseCase } from '../application/set-password.use-case';
import { VerifyOtpResult, VerifyOtpUseCase } from '../application/verify-otp.use-case';
import { VerifyResetCodeResult, VerifyResetCodeUseCase } from '../application/verify-reset-code.use-case';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginWithPasswordDto } from './dto/login-with-password.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';

/**
 * File 11 Part 05.1 / File 10 §2.3. Most routes here are `@Public()` —
 * there's no access token to check yet (that's the point of auth) — and
 * `/token/refresh`/`/logout` authenticate via the refresh token in the
 * body instead, exactly as File 11 07.1 specifies (not the global
 * `JwtAuthGuard`'s bearer-header path). `/me` and `/password/set` are the
 * exceptions: they act on the already-authenticated caller, so they go
 * through the global `JwtAuthGuard` like any other protected route.
 */
@Controller('auth')
export class IdentityAuthController {
  constructor(
    @Inject(RequestOtpUseCase) private readonly requestOtp: RequestOtpUseCase,
    @Inject(VerifyOtpUseCase) private readonly verifyOtp: VerifyOtpUseCase,
    @Inject(RefreshTokenUseCase) private readonly refreshToken: RefreshTokenUseCase,
    @Inject(LogoutUseCase) private readonly logout: LogoutUseCase,
    @Inject(GetCurrentUserUseCase) private readonly getCurrentUser: GetCurrentUserUseCase,
    @Inject(SetPasswordUseCase) private readonly setPassword: SetPasswordUseCase,
    @Inject(LoginWithPasswordUseCase) private readonly loginWithPassword: LoginWithPasswordUseCase,
    @Inject(ForgotPasswordUseCase) private readonly forgotPassword: ForgotPasswordUseCase,
    @Inject(ResetPasswordUseCase) private readonly resetPassword: ResetPasswordUseCase,
    @Inject(VerifyResetCodeUseCase) private readonly verifyResetCode: VerifyResetCodeUseCase,
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

  @Post('password/set')
  @HttpCode(204)
  async setPasswordEndpoint(@CurrentUser() payload: AccessTokenPayload, @Body() dto: SetPasswordDto): Promise<void> {
    await this.setPassword.execute({ userId: payload.sub, password: dto.password });
  }

  @Public()
  @Post('password/login')
  loginWithPasswordEndpoint(@Body() dto: LoginWithPasswordDto): Promise<LoginWithPasswordResult> {
    return this.loginWithPassword.execute({ phone: dto.phone, password: dto.password });
  }

  @Public()
  @Post('password/forgot')
  forgotPasswordEndpoint(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<ForgotPasswordResult> {
    return this.forgotPassword.execute({ phone: dto.phone, ip: req.ip });
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async resetPasswordEndpoint(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.resetPassword.execute({ requestId: dto.requestId, code: dto.code, newPassword: dto.newPassword });
  }

  // Read-only check: never consumes the OTP or touches password_hash — see
  // `VerifyResetCodeUseCase`. Lets a client confirm a code before showing
  // the "set a new password" step.
  @Public()
  @Post('password/reset/verify-code')
  verifyResetCodeEndpoint(@Body() dto: VerifyResetCodeDto): Promise<VerifyResetCodeResult> {
    return this.verifyResetCode.execute({ requestId: dto.requestId, code: dto.code });
  }
}
