import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { validateEnv } from './env.validation';

/**
 * Global, typed config — loaded once, injected everywhere via `ConfigService`.
 * Never read `process.env` directly outside this module (File 12 Part 12:
 * one place decides a value, not re-derived per call site).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
  ],
})
export class AppConfigModule {}
