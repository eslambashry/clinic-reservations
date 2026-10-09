import { Body, Controller, Delete, Get, HttpCode, Inject, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Public } from '../../../shared/core/auth/public.decorator';
import { AcceptLegalUseCase } from '../application/accept-legal.use-case';
import { DeleteAccountUseCase } from '../application/delete-account.use-case';
import { ForgotPasswordResult, ForgotPasswordUseCase } from '../application/forgot-password.use-case';
import { GetCurrentUserResult, GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import { LoginWithPasswordResult, LoginWithPasswordUseCase } from '../application/login-with-password.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { RefreshTokenResult, RefreshTokenUseCase } from '../application/refresh-token.use-case';
import { RegisterDeviceResult, RegisterDeviceUseCase } from '../application/register-device.use-case';
import { UnregisterDeviceUseCase } from '../application/unregister-device.use-case';
import { RequestOtpResult, RequestOtpUseCase } from '../application/request-otp.use-case';
import { ResetPasswordUseCase } from '../application/reset-password.use-case';
import { SetPasswordUseCase } from '../application/set-password.use-case';
import { SwitchContextResult, SwitchContextUseCase } from '../application/switch-context.use-case';
import { UpdateCurrentUserUseCase } from '../application/update-current-user.use-case';
import { VerifyOtpResult, VerifyOtpUseCase } from '../application/verify-otp.use-case';
import { VerifyResetCodeResult, VerifyResetCodeUseCase } from '../application/verify-reset-code.use-case';
import { AcceptLegalDto } from './dto/accept-legal.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginWithPasswordDto } from './dto/login-with-password.dto';
import { LoginWithPasswordQueryDto } from './dto/login-with-password-query.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { SwitchContextDto } from './dto/switch-context.dto';
import { UpdateMeDto } from './dto/update-me.dto';
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
    @Inject(UpdateCurrentUserUseCase) private readonly updateCurrentUser: UpdateCurrentUserUseCase,
    @Inject(SwitchContextUseCase) private readonly switchContextUseCase: SwitchContextUseCase,
    @Inject(RegisterDeviceUseCase) private readonly registerDeviceUseCase: RegisterDeviceUseCase,
    @Inject(UnregisterDeviceUseCase) private readonly unregisterDeviceUseCase: UnregisterDeviceUseCase,
    @Inject(DeleteAccountUseCase) private readonly deleteAccount: DeleteAccountUseCase,
    @Inject(AcceptLegalUseCase) private readonly acceptLegal: AcceptLegalUseCase,
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
    await this.logout.execute({ refreshToken: dto.refreshToken, allDevices: dto.allDevices, fcmToken: dto.fcmToken });
  }

  @Get('me')
  me(@CurrentUser() payload: AccessTokenPayload): Promise<GetCurrentUserResult> {
    return this.getCurrentUser.execute({ userId: payload.sub, activeRoleCode: payload.roleCode });
  }

  /** File 12 Part 53 — registers/refreshes an FCM token so `notifications` has somewhere to actually push to. */
  @Post('devices')
  @HttpCode(200)
  registerDevice(@CurrentUser() payload: AccessTokenPayload, @Body() dto: RegisterDeviceDto): Promise<RegisterDeviceResult> {
    return this.registerDeviceUseCase.execute({
      userId: payload.sub,
      sessionId: payload.sid,
      fcmToken: dto.fcmToken,
      platform: dto.platform,
      appVersion: dto.appVersion,
    });
  }

  @Delete('devices/current')
  @HttpCode(204)
  async unregisterDevice(@CurrentUser() payload: AccessTokenPayload, @Body() dto: UnregisterDeviceDto): Promise<void> {
    await this.unregisterDeviceUseCase.execute(payload.sub, payload.sid, dto.fcmToken);
  }

  /** S-2 fix — see `SwitchContextUseCase`'s doc comment. Bearer-authenticated like `/me`, not `@Public()`. */
  @Post('context/switch')
  @HttpCode(200)
  switchContext(@CurrentUser() payload: AccessTokenPayload, @Body() dto: SwitchContextDto): Promise<SwitchContextResult> {
    return this.switchContextUseCase.execute(payload.sub, { contextType: dto.contextType }, payload.sid);
  }

  @Patch('me')
  updateMe(@CurrentUser() payload: AccessTokenPayload, @Body() dto: UpdateMeDto): Promise<GetCurrentUserResult> {
    return this.updateCurrentUser.execute({
      userId: payload.sub,
      activeRoleCode: payload.roleCode,
      displayName: dto.display_name,
      email: dto.email,
    });
  }

  /** Self-service account deletion (soft-delete + anonymise) — see `DeleteAccountUseCase`. */
  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() payload: AccessTokenPayload): Promise<void> {
    await this.deleteAccount.execute(payload.sub);
  }

  /** Records acceptance of the Terms of Service + Privacy Policy for the given version. */
  @Post('legal/accept')
  @HttpCode(204)
  async acceptLegalEndpoint(@CurrentUser() payload: AccessTokenPayload, @Body() dto: AcceptLegalDto): Promise<void> {
    await this.acceptLegal.execute(payload.sub, dto.version);
  }

  @Post('password/set')
  @HttpCode(204)
  async setPasswordEndpoint(@CurrentUser() payload: AccessTokenPayload, @Body() dto: SetPasswordDto): Promise<void> {
    await this.setPassword.execute({ userId: payload.sub, password: dto.password });
  }

  @Public()
  @Post('password/login')
  loginWithPasswordEndpoint(@Body() dto: LoginWithPasswordDto, @Query() query: LoginWithPasswordQueryDto): Promise<LoginWithPasswordResult> {
    return this.loginWithPassword.execute({ phone: dto.phone, password: dto.password, role: query.role });
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
    await this.resetPassword.execute({ requestId: dto.requestId, newPassword: dto.newPassword });
  }

  // Verifies and records the OTP before the client can submit a new password.
  @Public()
  @Post('password/reset/verify-code')
  verifyResetCodeEndpoint(@Body() dto: VerifyResetCodeDto): Promise<VerifyResetCodeResult> {
    return this.verifyResetCode.execute({ requestId: dto.requestId, code: dto.code });
  }
}
