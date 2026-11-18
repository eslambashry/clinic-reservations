import { ListAssistantUserIdsForBranchUseCase } from './list-assistant-user-ids-for-branch.use-case';

describe('ListAssistantUserIdsForBranchUseCase', () => {
  const tx = {} as any;

  it('delegates to the assignments repository, optionally scoped by doctor', async () => {
    const assignments = { findActiveUserIdsByClinicBranchId: jest.fn().mockResolvedValue(['u1', 'u2']) };
    const useCase = new ListAssistantUserIdsForBranchUseCase(assignments as any);

    await expect(useCase.execute(tx, 'b1')).resolves.toEqual(['u1', 'u2']);
    expect(assignments.findActiveUserIdsByClinicBranchId).toHaveBeenLastCalledWith(tx, 'b1', undefined);

    await useCase.execute(tx, 'b1', 'd1');
    expect(assignments.findActiveUserIdsByClinicBranchId).toHaveBeenLastCalledWith(tx, 'b1', 'd1');
  });
});
