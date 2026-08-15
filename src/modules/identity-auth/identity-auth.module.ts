import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../shared/core/auth/auth-core.module';
import { IdentityAuthController } from './api/identity-auth.controller';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { OTP_SENDER } from './application/ports/otp-sender.port';
import { RefreshTokenUseCase } from './application/refresh-token.use-case';
import { RequestOtpUseCase } from './application/request-otp.use-case';
import { VerifyOtpUseCase } from './application/verify-otp.use-case';
import { LoggingOtpSender } from './infrastructure/logging-otp-sender';
import { OtpRequestRepository } from './infrastructure/otp-request.repository';
import { PermissionRepository } from './infrastructure/permission.repository';
import { PhoneRateLimiterService } from './infrastructure/phone-rate-limiter.service';
import { RefreshTokenRepository } from './infrastructure/refresh-token.repository';
import { RoleMembershipRepository } from './infrastructure/role-membership.repository';
import { TokenService } from './infrastructure/token.service';
import { UserRepository } from './infrastructure/user.repository';

/**
 * File 11 Part 03: owns `users`, `role_memberships`, `otp_requests`,
 * `refresh_tokens`, `devices` — no other module reaches into these tables
 * directly (File 12 Part 05); they call through use-cases exported below,
 * once a later phase needs to (e.g. Provider Directory verifying a Doctor's
 * `user_id`).
 */
@Module({
  imports: [AuthCoreModule],
  controllers: [IdentityAuthController],
  providers: [
    RequestOtpUseCase,
    VerifyOtpUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    GetCurrentUserUseCase,
    UserRepository,
    OtpRequestRepository,
    RoleMembershipRepository,
    RefreshTokenRepository,
    PermissionRepository,
    TokenService,
    PhoneRateLimiterService,
    { provide: OTP_SENDER, useClass: LoggingOtpSender },
  ],
})
export class IdentityAuthModule {}
