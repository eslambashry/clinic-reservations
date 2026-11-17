import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { SetReviewVisibilityUseCase } from './admin-reviews.use-cases';

describe('SetReviewVisibilityUseCase', () => {
  const tx = {};

  function setup(review: unknown) {
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const reviews = {
      findById: jest.fn().mockResolvedValue(review),
      setStatus: jest.fn(),
      countsByRating: jest.fn().mockResolvedValue({ 4: 1 }),
    };
    const recompute = {
      execute: jest.fn(async (_tx: any, _id: string, aggregate: () => Promise<unknown>) => {
        await aggregate();
        return { doctorUserId: 'u' };
      }),
    };
    return { reviews, recompute, useCase: new SetReviewVisibilityUseCase(prisma as any, reviews as any, recompute as any) };
  }

  it('404s for an unknown review', async () => {
    const { useCase } = setup(null);
    await expect(useCase.execute('r-1', true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('hides a published review and recomputes the doctor rating', async () => {
    const { reviews, recompute, useCase } = setup({ id: 'r-1', subject_id: 'doctor-1', status: 'PUBLISHED', version: 3 });

    await expect(useCase.execute('r-1', true)).resolves.toEqual({ id: 'r-1', status: 'HIDDEN' });
    expect(reviews.setStatus).toHaveBeenCalledWith(tx, 'r-1', 3, 'HIDDEN');
    expect(recompute.execute).toHaveBeenCalledWith(tx, 'doctor-1', expect.any(Function));
  });

  it('is a no-op when the status already matches', async () => {
    const { reviews, recompute, useCase } = setup({ id: 'r-1', subject_id: 'doctor-1', status: 'HIDDEN' });

    await useCase.execute('r-1', true);
    expect(reviews.setStatus).not.toHaveBeenCalled();
    expect(recompute.execute).not.toHaveBeenCalled();
  });
});
