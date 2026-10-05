/**
 * Jest `setupFiles` entry for every suite that writes to a real Postgres
 * (`*.integration.spec.ts`, `test/*.e2e-spec.ts`). Those suites create and
 * delete rows, so they must never run against whatever `.env` happens to
 * point at (a shared Neon branch, staging, production).
 *
 * They run only when `TEST_DATABASE_URL` names an explicitly disposable
 * database. That value replaces `DATABASE_URL`/`DIRECT_URL` before any spec
 * loads; `dotenv`, Nest's `ConfigModule` and Prisma all leave an
 * already-set process variable alone, so `.env` cannot override it.
 *
 *   TEST_DATABASE_URL=postgresql://medsuper:medsuper@localhost:5432/medsuper_test \
 *   TEST_REDIS_URL=redis://localhost:6379/15 \
 *   npm run test:integration
 */
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const dotenv = require('dotenv');

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    'DB-backed suites need TEST_DATABASE_URL pointing at a disposable Postgres; refusing to fall back to DATABASE_URL from .env.',
  );
}

const envFile = join(__dirname, '..', '.env');
const ambient = existsSync(envFile) ? dotenv.parse(readFileSync(envFile)) : {};
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  if (ambient[key] && ambient[key] === testUrl) {
    throw new Error(`TEST_DATABASE_URL equals ${key} in .env; point it at a separate disposable database.`);
  }
}

process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL || testUrl;
if (process.env.TEST_REDIS_URL) {
  process.env.REDIS_URL = process.env.TEST_REDIS_URL;
}
