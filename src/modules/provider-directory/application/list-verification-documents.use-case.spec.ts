import { encodeCursor } from '../../../shared/core/pagination/cursor.util';
import { ListVerificationDocumentsUseCase } from './list-verification-documents.use-case';

function doc(id: string) {
  return { id, file_url: `raw-${id}`, created_at: new Date('2026-01-01T00:00:00.000Z') };
}

describe('ListVerificationDocumentsUseCase', () => {
  function setup() {
    const prisma = {} as any;
    const documents = { list: jest.fn().mockResolvedValue([]) };
    const media = { getSignedUrl: jest.fn((url: string) => `signed-${url}`) };
    const useCase = new ListVerificationDocumentsUseCase(prisma, documents as any, media as any);
    return { prisma, documents, media, useCase };
  }

  it('passes filters, signs urls, and has no next cursor on the last page', async () => {
    const { prisma, documents, useCase } = setup();
    documents.list.mockResolvedValue([doc('d1')]);

    const res = await useCase.execute({ providerType: 'DOCTOR', providerId: 'x', status: 'PENDING' as any, limit: 5 });

    expect(documents.list).toHaveBeenCalledWith(prisma, {
      providerType: 'DOCTOR', providerId: 'x', status: 'PENDING', cursor: undefined, limit: 6,
    });
    expect(res.items[0].file_url).toBe('signed-raw-d1');
    expect(res.nextCursor).toBeNull();
  });

  it('trims the extra row, returns a cursor and decodes the incoming cursor', async () => {
    const { documents, useCase } = setup();
    documents.list.mockResolvedValue([doc('d1'), doc('d2'), doc('d3')]);
    const cursor = encodeCursor({ c: '2025-01-01T00:00:00.000Z', i: 'd0' });

    const res = await useCase.execute({ limit: 2, cursor });

    expect(documents.list).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      cursor: { createdAt: '2025-01-01T00:00:00.000Z', id: 'd0' }, limit: 3,
    }));
    expect(res.items.map((i) => i.id)).toEqual(['d1', 'd2']);
    expect(res.nextCursor).toEqual(encodeCursor({ c: '2026-01-01T00:00:00.000Z', i: 'd2' }));
  });

  it('defaults limit to 20 and caps at 50', async () => {
    const { documents, useCase } = setup();
    await useCase.execute({});
    expect(documents.list).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ limit: 21 }));
    await useCase.execute({ limit: 999 });
    expect(documents.list).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ limit: 51 }));
  });
});
