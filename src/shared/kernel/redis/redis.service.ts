// import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import Redis from 'ioredis';

// /**
//  * Thin DI wrapper around the `ioredis` client (File 11 Part 21: cache +
//  * session + queue backing). Exposes the raw client via `.client` for
//  * anything beyond simple get/set (pub/sub, pipelines) instead of
//  * re-wrapping ioredis's entire API surface preemptively.
//  */
// @Injectable()
// export class RedisService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(RedisService.name);
//   public readonly client: Redis;

//   // See the identical note in `PrismaService` — explicit `@Inject` avoids a
//   // `tsx`-only metadata-reflection quirk for `ConfigService` injection.
//   constructor(@Inject(ConfigService) config: ConfigService) {
//     this.client = new Redis(config.get<string>('redis.url') as string, {
//       lazyConnect: true,
//       maxRetriesPerRequest: 3,
//     });
//   }

//   async onModuleInit(): Promise<void> {
//     await this.client.connect();
//     this.logger.log('Connected to Redis');
//   }

//   async onModuleDestroy(): Promise<void> {
//     this.client.disconnect();
//   }

//   async get(key: string): Promise<string | null> {
//     return this.client.get(key);
//   }

//   async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
//     if (ttlSeconds) {
//       await this.client.set(key, value, 'EX', ttlSeconds);
//     } else {
//       await this.client.set(key, value);
//     }
//   }

//   async del(key: string): Promise<void> {
//     await this.client.del(key);
//   }
// }


import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  private readonly enabled: boolean;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.enabled = config.get<boolean>('redis.enabled') ?? true;

    this.client = new Redis(config.get<string>('redis.url') as string, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Redis is disabled');
      return;
    }

    await this.client.connect();
    this.logger.log('Connected to Redis');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.enabled) {
      this.client.disconnect();
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.client.del(key);
  }
}