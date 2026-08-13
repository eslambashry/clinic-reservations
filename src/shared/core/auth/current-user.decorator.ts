import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenPayload } from './jwt-payload.interface';

/**
 * Injects the verified token payload `JwtAuthGuard` attached to the request.
 * Never read `req.user` directly in a controller — go through this so the
 * shape is typed in one place.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
  const request = ctx.switchToHttp().getRequest<Request & { user: AccessTokenPayload }>();
  return request.user;
});
