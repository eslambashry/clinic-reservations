import { AuditLogsController } from './audit-logs.controller';

describe('AuditLogsController', () => {
  it('delegates the query to the list use case', async () => {
    const uc = { execute: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const query = { limit: 10 } as any;
    await expect(new AuditLogsController(uc as any).list(query)).resolves.toEqual({ items: [], nextCursor: null });
    expect(uc.execute).toHaveBeenCalledWith(query);
  });
});
