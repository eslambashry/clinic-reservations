import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ForbiddenError } from '../errors/domain-errors';
import { AccessTokenPayload } from './jwt-payload.interface';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { ROLES_KEY } from './roles.decorator';

/**
 * Runs after `JwtAuthGuard`. Enforces `@Roles()`/`@Permissions()` metadata
 * against the token claims — an endpoint with neither decorator is
 * authenticated-only (no additional restriction), matching File 11 07.2's
 * "authorization matrix" model of context-type + permission-code checks.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredContexts = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredContexts?.length && !requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenError();
    }

    if (requiredContexts?.length && !requiredContexts.includes(user.contextType)) {
      throw new ForbiddenError('ROLE_NOT_PERMITTED', `This action requires one of: ${requiredContexts.join(', ')}.`);
    }

    if (requiredPermissions?.length) {
      const missing = requiredPermissions.filter((code) => !user.permissions.includes(code));
      if (missing.length > 0) {
        throw new ForbiddenError('ROLE_NOT_PERMITTED', `Missing required permission(s): ${missing.join(', ')}.`);
      }
    }

    return true;
  }
}
