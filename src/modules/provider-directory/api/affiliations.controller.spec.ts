import { AffiliationsController } from './affiliations.controller';

describe('AffiliationsController', () => {
  it('update delegates and returns void', async () => {
    const uc = { execute: jest.fn().mockResolvedValue({ x: 1 }) };
    const c = new AffiliationsController(uc as never);
    const dto = {} as never;
    const user = { sub: 'u' } as never;
    await expect(c.update('a1', dto, user)).resolves.toBeUndefined();
    expect(uc.execute).toHaveBeenCalledWith('a1', dto, user);
  });
});
