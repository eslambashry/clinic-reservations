import { AuditService } from './audit.service';

describe('AuditService', () => {
  const tx = { tx: true } as any;

  function setup() {
    const repository = { create: jest.fn().mockResolvedValue({}), findByResource: jest.fn() };
    const context = { correlationId: 'corr-1' };
    return { repository, service: new AuditService(repository as any, context as any) };
  }

  it('record writes the entry with the request correlation id', async () => {
    const { repository, service } = setup();
    await service.record(tx, { actorUserId: 'u', action: 'a.b', resourceType: 't', resourceId: 'r' });
    expect(repository.create).toHaveBeenCalledWith(tx, {
      actorUserId: 'u',
      action: 'a.b',
      resourceType: 't',
      resourceId: 'r',
      correlationId: 'corr-1',
    });
  });

  it('listByResource delegates to the repository', async () => {
    const { repository, service } = setup();
    repository.findByResource.mockResolvedValue([{ id: '1' }]);
    await expect(service.listByResource(tx, 'order', ['o1'])).resolves.toEqual([{ id: '1' }]);
    expect(repository.findByResource).toHaveBeenCalledWith(tx, 'order', ['o1']);
  });
});
