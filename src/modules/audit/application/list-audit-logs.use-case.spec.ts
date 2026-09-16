import { ListAuditLogsUseCase } from './list-audit-logs.use-case';

function row(index: number) {
  return {
    id: `audit-${index}`,
    actor_user_id: null,
    actor_role_membership_id: null,
    action: 'test.action',
    resource_type: 'test_resource',
    resource_id: '11111111-1111-4111-8111-111111111111',
    subject_patient_id: null,
    reason_code: null,
    correlation_id: null,
    source_ip: null,
    occurred_at: new Date(`2026-09-16T00:${String(index).padStart(2, '0')}:00.000Z`),
  } as any;
}

describe('ListAuditLogsUseCase', () => {
  function setup(rows: any[], totalCount = rows.length) {
    const auditLogs = {
      list: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(totalCount),
    };
    return { auditLogs, useCase: new ListAuditLogsUseCase({} as any, auditLogs as any) };
  }

  it('requests one extra row and does not invent a cursor for an exactly-full final page', async () => {
    const { auditLogs, useCase } = setup([row(1), row(2)]);

    const result = await useCase.execute({ limit: 2 });

    expect(auditLogs.list).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ limit: 3 }));
    expect(result.entries).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('trims the extra row and returns a cursor only when another page exists', async () => {
    const { useCase } = setup([row(1), row(2), row(3)]);

    const result = await useCase.execute({ limit: 2 });

    expect(result.entries.map((entry) => entry.id)).toEqual(['audit-1', 'audit-2']);
    expect(result.nextCursor).not.toBeNull();
  });
});
