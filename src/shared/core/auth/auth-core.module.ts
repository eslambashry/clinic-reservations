import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RbacGuard } from './rbac.guard';

/**
 * Configures JWT signing/verification and provides the two auth guard
 * classes. Registered as global `APP_GUARD`s by `CoreModule`, not here —
 * keeping every global enhancer registration in one place (`CoreModule`)
 * makes execution order (throttle → authenticate → authorize) explicit
 * instead of implicit in cross-module registration order.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: { expiresIn: config.get<number>('jwt.accessTtlSeconds') },
      }),
    }),
  ],
  providers: [JwtAuthGuard, RbacGuard],
  exports: [JwtModule, JwtAuthGuard, RbacGuard],
})
export class AuthCoreModule {}
