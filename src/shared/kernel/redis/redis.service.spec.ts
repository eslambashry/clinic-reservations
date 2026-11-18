const mockClient = { connect: jest.fn(), disconnect: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn() };
const RedisCtor = jest.fn(() => mockClient);
jest.mock('ioredis', () => ({ __esModule: true, default: RedisCtor }));

import { RedisService } from './redis.service';

function make(cfg: Record<string, unknown>) {
  return new RedisService({ get: (k: string) => cfg[k] } as any);
}

describe('RedisService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes tls options only when a CA cert is configured', () => {
    make({ 'redis.url': 'redis://x', 'redis.caCert': 'CERT' });
    expect(RedisCtor).toHaveBeenLastCalledWith('redis://x', expect.objectContaining({ tls: { ca: 'CERT' } }));
    make({ 'redis.url': 'redis://x' });
    expect((RedisCtor.mock.calls.at(-1) as any)[1]).not.toHaveProperty('tls');
  });

  it('connects and disconnects when enabled (default)', async () => {
    const s = make({ 'redis.url': 'u' });
    await s.onModuleInit();
    await s.onModuleDestroy();
    expect(mockClient.connect).toHaveBeenCalled();
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it('get/set/del delegate to the client, with and without TTL', async () => {
    const s = make({ 'redis.url': 'u', 'redis.enabled': true });
    mockClient.get.mockResolvedValue('v');
    expect(await s.get('k')).toBe('v');
    await s.set('k', 'v', 10);
    expect(mockClient.set).toHaveBeenLastCalledWith('k', 'v', 'EX', 10);
    await s.set('k', 'v');
    expect(mockClient.set).toHaveBeenLastCalledWith('k', 'v');
    await s.del('k');
    expect(mockClient.del).toHaveBeenCalledWith('k');
  });

  it('is a no-op when disabled', async () => {
    const s = make({ 'redis.url': 'u', 'redis.enabled': false });
    await s.onModuleInit();
    await s.onModuleDestroy();
    expect(await s.get('k')).toBeNull();
    await s.set('k', 'v');
    await s.del('k');
    expect(mockClient.connect).not.toHaveBeenCalled();
    expect(mockClient.disconnect).not.toHaveBeenCalled();
    expect(mockClient.get).not.toHaveBeenCalled();
    expect(mockClient.set).not.toHaveBeenCalled();
    expect(mockClient.del).not.toHaveBeenCalled();
  });
});
