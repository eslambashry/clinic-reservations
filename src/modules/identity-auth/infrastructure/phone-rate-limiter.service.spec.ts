import { PhoneRateLimiterService } from './phone-rate-limiter.service';

describe('PhoneRateLimiterService', () => {
  const client = { incr: jest.fn(), expire: jest.fn() };
  const svc = new PhoneRateLimiterService({ client } as any);
  beforeEach(() => jest.resetAllMocks());

  it('first request sets expiry and is allowed (defaults)', async () => {
    client.incr.mockResolvedValue(1);
    expect(await svc.consume('+20')).toBe(true);
    expect(client.incr).toHaveBeenCalledWith('otp-rate:+20');
    expect(client.expire).toHaveBeenCalledWith('otp-rate:+20', 600);
  });

  it('does not reset expiry on later requests; allows up to max, blocks beyond', async () => {
    client.incr.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    expect(await svc.consume('+20')).toBe(true);
    expect(await svc.consume('+20')).toBe(false);
    expect(client.expire).not.toHaveBeenCalled();
  });

  it('honours custom options', async () => {
    client.incr.mockResolvedValue(1);
    expect(await svc.consume('p', { keyPrefix: 'login', maxRequests: 0, windowSeconds: 5 })).toBe(false);
    expect(client.expire).toHaveBeenCalledWith('login:p', 5);
  });
});
