import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import { encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { ListDoctorReviewsUseCase } from './list-doctor-reviews.use-case';

describe('ListDoctorReviewsUseCase', () => {
  const row = (id: string, createdAt: string, rating = 5) => ({
    id,
    rating,
    comment: null,
    created_at: new Date(createdAt),
    patient: { first_name: 'Mona', last_name: 'Tester' },
  });

  function setup() {
    const reviews = {
      countsByRating: jest.fn().mockResolvedValue({ 5: 2, 4: 1 }),
      listForDoctor: jest.fn().mockResolvedValue([]),
    };
    const doctorScope = { execute: jest.fn().mockResolvedValue({ doctorId: 'doctor-own' }) };
    const doctorVisible = { execute: jest.fn().mockResolvedValue(undefined) };
    const useCase = new ListDoctorReviewsUseCase({} as any, reviews as any, doctorScope as any, doctorVisible as any);
    return { reviews, doctorScope, doctorVisible, useCase };
  }

  it('checks public visibility before reading anything', async () => {
    const { reviews, doctorVisible, useCase } = setup();
    doctorVisible.execute.mockRejectedValue(new NotFoundError('Doctor', 'd-1'));

    await expect(useCase.execute('d-1', {}, undefined)).rejects.toBeInstanceOf(NotFoundError);
    expect(reviews.countsByRating).not.toHaveBeenCalled();
    expect(reviews.listForDoctor).not.toHaveBeenCalled();
  });

  it('passes the caller context so an Admin can bypass visibility', async () => {
    const { doctorVisible, useCase } = setup();
    await useCase.execute('d-1', {}, 'ADMIN');
    expect(doctorVisible.execute).toHaveBeenCalledWith('d-1', 'ADMIN');
  });

  it("serves the caller's own doctor on `me` without a visibility check", async () => {
    const { reviews, doctorScope, doctorVisible, useCase } = setup();

    await useCase.executeForMe({ sub: 'u-1' } as any, {});

    expect(doctorScope.execute).toHaveBeenCalled();
    expect(doctorVisible.execute).not.toHaveBeenCalled();
    expect(reviews.listForDoctor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ doctorId: 'doctor-own', status: 'PUBLISHED' }));
  });

  it('returns a nextCursor only when another page exists, and summarizes the histogram', async () => {
    const { reviews, useCase } = setup();
    reviews.listForDoctor.mockResolvedValue([row('00000000-0000-4000-8000-000000000003', '2026-11-16T10:00:03.000Z'), row('00000000-0000-4000-8000-000000000002', '2026-11-16T10:00:02.000Z')]);

    const result = await useCase.execute('d-1', { limit: 1 }, undefined);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].patientName).toBe('Mona');
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(result.summary).toEqual({ avg: 4.7, count: 3, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 } });

    reviews.listForDoctor.mockResolvedValue([row('00000000-0000-4000-8000-000000000003', '2026-11-16T10:00:03.000Z')]);
    expect((await useCase.execute('d-1', { limit: 1 }, undefined)).nextCursor).toBeNull();
  });

  it('feeds a valid cursor to the repository', async () => {
    const { reviews, useCase } = setup();
    const cursor = { c: '2026-11-16T10:00:03.000Z', i: '00000000-0000-4000-8000-000000000003' };

    await useCase.execute('d-1', { cursor: encodeCursor(cursor) }, undefined);

    expect(reviews.listForDoctor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cursor }));
  });

  it.each([{}, 5, { c: 'x', i: 'y' }, { c: '2026-11-16T10:00:03.000Z', i: 'not-a-uuid' }, { c: 7, i: '00000000-0000-4000-8000-000000000003' }])(
    'rejects the malformed cursor %j with a 400',
    async (payload) => {
      const { reviews, useCase } = setup();
      await expect(useCase.execute('d-1', { cursor: encodeCursor(payload) }, undefined)).rejects.toMatchObject({ httpStatus: 400 });
      expect(reviews.listForDoctor).not.toHaveBeenCalled();
    },
  );
});
