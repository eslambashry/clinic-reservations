import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UnauthenticatedError } from '../errors/domain-errors';
import { AccessTokenPayload } from './jwt-payload.interface';
import { IS_OPTIONAL_AUTH_KEY } from './optional-auth.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Applied globally (File 11 Part 23: fail-closed by default). Verifies the
 * `Authorization: Bearer <jwt>` header and attaches the decoded claims to
 * `request.user` for `RbacGuard`/`@CurrentUser()` to read. Endpoints marked
 * `@Public()` (OTP request/verify, login, health check) skip verification
 * entirely. Endpoints marked `@OptionalAuth()` (File 12 Part 32.9) verify a
 * token if one is present but never throw if it's missing/invalid.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    const token = this.extractToken(request);

    if (!token) {
      if (isOptional) {
        return true;
      }
      throw new UnauthenticatedError();
    }

    try {
      request.user = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      return true;
    } catch (error) {
      if (isOptional) {
        return true;
      }
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new UnauthenticatedError('TOKEN_EXPIRED', 'Access token has expired.');
      }
      throw new UnauthenticatedError('UNAUTHENTICATED', 'Invalid access token.');
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }
    return header.slice('Bearer '.length);
  }
}
