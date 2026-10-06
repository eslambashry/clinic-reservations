const ctor = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(o: unknown) {
      ctor(o);
    }
  },
}));
jest.mock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));
jest.mock('../shared/kernel/prisma/optimistic-lock', () => ({ updateWithOptimisticLock: jest.fn() }));

describe('db/client', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    (process.env as any).NODE_ENV = env;
    delete (global as any).prisma;
    ctor.mockClear();
  });

  function load(nodeEnv: string) {
    (process.env as any).NODE_ENV = nodeEnv;
    delete (global as any).prisma;
    let mod: any;
    jest.isolateModules(() => {
      mod = require('./client');
    });
    return mod;
  }

  it('uses verbose logging in development and caches on global', () => {
    const mod = load('development');
    expect(ctor).toHaveBeenCalledWith({ log: ['query', 'info', 'warn', 'error'] });
    expect((global as any).prisma).toBe(mod.prisma);
    expect(mod.updateWithOptimisticLock).toBeDefined();
  });

  it('does not cache on global in production', () => {
    load('production');
    expect(ctor).toHaveBeenCalledWith({ log: ['error'] });
    expect((global as any).prisma).toBeUndefined();
  });

  it('reuses an existing global client', () => {
    const existing = {};
    (process.env as any).NODE_ENV = 'test';
    (global as any).prisma = existing;
    let mod: any;
    jest.isolateModules(() => {
      mod = require('./client');
    });
    expect(mod.prisma).toBe(existing);
    expect(ctor).not.toHaveBeenCalled();
  });
});
