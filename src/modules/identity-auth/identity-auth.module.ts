import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../shared/core/auth/auth-core.module';
import { IdentityAuthController } from './api/identity-auth.controller';
import { ForgotPasswordUseCase } from './application/forgot-password.use-case';
import { GetActiveRoleMembershipUseCase } from './application/get-active-role-membership.use-case';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case';
import { GetUserSummaryUseCase } from './application/get-user-summary.use-case';
import { LoginWithPasswordUseCase } from './application/login-with-password.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { OTP_SENDER } from './application/ports/otp-sender.port';
import { RefreshTokenUseCase } from './application/refresh-token.use-case';
import { RequestOtpUseCase } from './application/request-otp.use-case';
import { ResetPasswordUseCase } from './application/reset-password.use-case';
import { SetPasswordUseCase } from './application/set-password.use-case';
import { UpdateCurrentUserUseCase } from './application/update-current-user.use-case';
import { UpdateUserProfileUseCase } from './application/update-user-profile.use-case';
import { VerifyOtpUseCase } from './application/verify-otp.use-case';
import { VerifyResetCodeUseCase } from './application/verify-reset-code.use-case';
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
 * directly (File 12 Part 05); they call through use-cases exported below.
 * `UpdateUserProfileUseCase` is the first cross-module case this needed —
 * Provider Directory's self-registration flow enriching the caller's own
 * `User` row (ADR-005 Part 34.2) — and takes `tx` explicitly so it commits
 * atomically with the caller's own transaction, mirroring how `payments`
 * consumes Provider Directory's `GetAffiliationBillingInfoUseCase`.
 * File 12 Part 39 adds `GetActiveRoleMembershipUseCase` — a generic,
 * `contextType`-parameterized lookup `pharmacy-fulfillment` uses to resolve
 * which branch a `PHARMACY_STAFF` caller belongs to. 2026-08-29 adds
 * `GetUserSummaryUseCase` — a plain, tx-scoped `id -> {firstName, lastName,
 * phoneMasked}` lookup, the same shape need `pharmacy-fulfillment`'s
 * order-detail response now has for its patient/doctor projections.
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
    SetPasswordUseCase,
    LoginWithPasswordUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    VerifyResetCodeUseCase,
    UpdateUserProfileUseCase,
    UpdateCurrentUserUseCase,
    GetActiveRoleMembershipUseCase,
    GetUserSummaryUseCase,
    UserRepository,
    OtpRequestRepository,
    RoleMembershipRepository,
    RefreshTokenRepository,
    PermissionRepository,
    TokenService,
    PhoneRateLimiterService,
    { provide: OTP_SENDER, useClass: LoggingOtpSender },
  ],
  exports: [UpdateUserProfileUseCase, GetActiveRoleMembershipUseCase, GetUserSummaryUseCase],
})
export class IdentityAuthModule {}
