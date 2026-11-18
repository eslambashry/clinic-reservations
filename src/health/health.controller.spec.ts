import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function make(dbOk: boolean, redisOk: boolean) {
  const prisma = { $queryRaw: jest.fn(() => (dbOk ? Promise.resolve([1]) : Promise.reject(new Error('db')))) };
  const redis = { client: { ping: jest.fn(() => (redisOk ? Promise.resolve('PONG') : Promise.reject(new Error('r')))) } };
  return new HealthController(prisma as any, redis as any);
}

describe('HealthController', () => {
  it('live', () => expect(make(true, true).live()).toEqual({ status: 'ok' }));
  it('ready when both ok', async () => {
    expect(await make(true, true).ready()).toEqual({ status: 'ready', checks: { database: 'ok', redis: 'ok' } });
  });
  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])('503 when db=%s redis=%s', async (d, r) => {
    await expect(make(d, r).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
