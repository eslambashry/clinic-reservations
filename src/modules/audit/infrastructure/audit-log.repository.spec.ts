import { AuditLogRepository } from './audit-log.repository';

describe('AuditLogRepository', () => {
  const repo = new AuditLogRepository();

  it('create maps every field to its column', async () => {
    const db = { auditLog: { create: jest.fn().mockResolvedValue({ id: 'a' }) } } as any;
    await repo.create(db, {
      actorUserId: 'u',
      actorRoleMembershipId: 'rm',
      action: 'x.y',
      resourceType: 't',
      resourceId: 'r',
      subjectPatientId: 'p',
      reasonCode: 'why',
      correlationId: 'c',
      sourceIp: '1.1.1.1',
    });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        actor_user_id: 'u',
        actor_role_membership_id: 'rm',
        action: 'x.y',
        resource_type: 't',
        resource_id: 'r',
        subject_patient_id: 'p',
        reason_code: 'why',
        correlation_id: 'c',
        source_ip: '1.1.1.1',
      },
    });
  });

  describe('findByResource', () => {
    it('short-circuits on an empty id list', async () => {
      const db = { auditLog: { findMany: jest.fn() } } as any;
      await expect(repo.findByResource(db, 't', [])).resolves.toEqual([]);
      expect(db.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('queries the resource ids newest first', async () => {
      const db = { auditLog: { findMany: jest.fn().mockResolvedValue([{ id: '1' }]) } } as any;
      await expect(repo.findByResource(db, 't', ['a', 'b'])).resolves.toEqual([{ id: '1' }]);
      expect(db.auditLog.findMany).toHaveBeenCalledWith({
        where: { resource_type: 't', resource_id: { in: ['a', 'b'] } },
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      });
    });
  });

  describe('list / count', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    const occurredAt = new Date('2026-01-15T00:00:00Z');

    it('builds the full filter with a keyset cursor', async () => {
      const db = { auditLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(4) } } as any;
      const filter = {
        actorUserId: 'u',
        action: 'a',
        resourceType: 't',
        resourceId: 'r',
        from,
        to,
        cursor: { occurredAt, id: 'c1' },
        limit: 20,
      };
      await repo.list(db, filter);
      const expectedWhere = {
        actor_user_id: 'u',
        action: 'a',
        resource_type: 't',
        resource_id: 'r',
        occurred_at: { gte: from, lte: to },
        OR: [{ occurred_at: { lt: occurredAt } }, { occurred_at: occurredAt, id: { lt: 'c1' } }],
      };
      expect(db.auditLog.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        take: 20,
      });

      await expect(repo.count(db, filter)).resolves.toBe(4);
      expect(db.auditLog.count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('builds an empty filter when nothing is given', async () => {
      const db = { auditLog: { findMany: jest.fn() } } as any;
      await repo.list(db, { limit: 5 });
      expect(db.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        take: 5,
      });
    });

    it('uses only a lower or upper bound when one is given', async () => {
      const db = { auditLog: { findMany: jest.fn() } } as any;
      await repo.list(db, { from, limit: 5 });
      expect(db.auditLog.findMany.mock.calls[0][0].where).toEqual({ occurred_at: { gte: from } });
      await repo.list(db, { to, limit: 5 });
      expect(db.auditLog.findMany.mock.calls[1][0].where).toEqual({ occurred_at: { lte: to } });
    });

    it('offset mode passes skip and ignores the cursor', async () => {
      const db = { auditLog: { findMany: jest.fn() } } as any;
      await repo.list(db, { cursor: { occurredAt, id: 'c1' }, limit: 5, skip: 10 });
      expect(db.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
        take: 5,
        skip: 10,
      });
    });
  });
});
