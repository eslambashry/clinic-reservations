const ctorArgs: any[] = [];
const connect = jest.fn();
const disconnect = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(opts: unknown) {
      ctorArgs.push(opts);
    }
    $connect = connect;
    $disconnect = disconnect;
  },
}));

import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('logs warn+error in development, error only otherwise', () => {
    new PrismaService({ get: () => 'development' } as any);
    new PrismaService({ get: () => 'production' } as any);
    expect(ctorArgs[0]).toEqual({ log: ['warn', 'error'] });
    expect(ctorArgs[1]).toEqual({ log: ['error'] });
  });

  it('connects on init and disconnects on destroy', async () => {
    const s = new PrismaService({ get: () => 'test' } as any);
    await s.onModuleInit();
    await s.onModuleDestroy();
    expect(connect).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });
});
