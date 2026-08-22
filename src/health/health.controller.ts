import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../shared/core/auth/public.decorator';
import { PrismaService } from '../shared/kernel/prisma/prisma.service';
import { RedisService } from '../shared/kernel/redis/redis.service';

/**
 * File 11 Part 24: "Liveness = process responsive; Readiness = DB + Redis
 * reachable." Both endpoints are public — a load balancer/orchestrator
 * checking health has no access token.
 */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: string; checks: Record<string, 'ok' | 'error'> }> {
    const checks: Record<string, 'ok' | 'error'> = { database: 'error', redis: 'error' };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      // left as 'error'
    }

    try {
      await this.redis.client.ping();
      checks.redis = 'ok';
    } catch {
      // left as 'error'
    }

    const ready = Object.values(checks).every((c) => c === 'ok');
    if (!ready) {
      throw new ServiceUnavailableException({ status: 'not_ready', checks });
    }

    return { status: 'ready', checks };
  }
}
