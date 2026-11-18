import { encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { ListAuditLogsUseCase } from './list-audit-logs.use-case';

function row(i: number) {
  return {
    id: `a-${i}`,
    actor_user_id: 'u',
    action: 'x',
    resource_type: 'r',
    resource_id: 'rid',
    reason_code: null,
    correlation_id: 'c',
    occurred_at: new Date(`2026-09-16T00:0${i}:00.000Z`),
  } as any;
}

describe('ListAuditLogsUseCase branches', () => {
  const setup = (rows: any[], total = rows.length) => {
    const auditLogs = { list: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(total) };
    return { auditLogs, useCase: new ListAuditLogsUseCase({} as any, auditLogs as any) };
  };

  it('offset mode uses skip/take, ignores cursor and reports page meta', async () => {
    const { auditLogs, useCase } = setup([row(1), row(2)], 25);
    const res = await useCase.execute({ page: 2, limit: 10 });
    expect(auditLogs.list).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 10, skip: 10 }));
    expect(res.nextCursor).toBeNull();
    expect(res.page).toBe(2);
    expect(res.totalCount).toBe(25);
    expect(res.entries[0]).toMatchObject({ id: 'a-1', actorUserId: 'u', occurredAt: '2026-09-16T00:01:00.000Z' });
  });

  it('cursor mode decodes the keyset cursor and forwards date filters', async () => {
    const { auditLogs, useCase } = setup([row(1)]);
    const cursor = encodeCursor({ o: '2026-09-01T00:00:00.000Z', i: 'a-0' });
    await useCase.execute({ cursor, from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z', action: 'x' });
    const arg = auditLogs.list.mock.calls[0][1];
    expect(arg.cursor).toEqual({ occurredAt: new Date('2026-09-01T00:00:00.000Z'), id: 'a-0' });
    expect(arg.from).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(arg.to).toEqual(new Date('2026-02-01T00:00:00Z'));
    expect(arg.limit).toBe(51);
  });

  it('cursor mode without cursor/filters leaves them undefined', async () => {
    const { auditLogs, useCase } = setup([]);
    await useCase.execute({});
    const arg = auditLogs.list.mock.calls[0][1];
    expect(arg.cursor).toBeUndefined();
    expect(arg.from).toBeUndefined();
    expect(arg.to).toBeUndefined();
  });

  it('emits nextCursor from the last kept row when more exist', async () => {
    const { useCase } = setup([row(1), row(2), row(3)]);
    const res = await useCase.execute({ limit: 2 });
    expect(res.entries).toHaveLength(2);
    expect(res.nextCursor).toBe(encodeCursor({ o: row(2).occurred_at.toISOString(), i: 'a-2' }));
  });
});
