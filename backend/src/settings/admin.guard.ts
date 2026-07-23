import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Shared-secret guard for admin-only endpoints. The frontend never holds the
 * secret — its server-side proxy routes attach it. Fails closed: with no
 * ADMIN_PASSWORD configured every request is rejected.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // `||` rather than `??`: docker-compose passes unset variables through as "".
    const password = process.env.ADMIN_PASSWORD || '';
    if (!password) {
      throw new UnauthorizedException('ADMIN_PASSWORD is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-admin-key'];
    if (provided !== password) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}
