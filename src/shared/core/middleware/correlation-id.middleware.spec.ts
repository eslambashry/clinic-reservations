import { CorrelationIdMiddleware } from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  const context = { run: jest.fn((_ctx: any, cb: () => void) => cb()) };
  const middleware = new CorrelationIdMiddleware(context as any);
  beforeEach(() => context.run.mockClear());

  it('reuses an inbound correlation id', () => {
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware.use({ header: () => 'abc' } as any, res as any, next);
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'abc');
    expect(context.run).toHaveBeenCalledWith({ correlationId: 'abc' }, expect.any(Function));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a uuid when the header is missing', () => {
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    middleware.use({ header: () => undefined } as any, res as any, next);
    const id = res.setHeader.mock.calls[0][1];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(context.run).toHaveBeenCalledWith({ correlationId: id }, expect.any(Function));
    expect(next).toHaveBeenCalled();
  });
});
