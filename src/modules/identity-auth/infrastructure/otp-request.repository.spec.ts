import { OtpRequestRepository } from './otp-request.repository';

describe('OtpRequestRepository', () => {
  const repo = new OtpRequestRepository();
  const db: any = { otpRequest: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
  beforeEach(() => jest.resetAllMocks());

  it('create maps params', async () => {
    const expiresAt = new Date();
    db.otpRequest.create.mockResolvedValue({ id: '1' });
    expect(await repo.create(db, { phone: 'p', codeHash: 'h', purpose: 'LOGIN', expiresAt })).toEqual({ id: '1' });
    expect(db.otpRequest.create).toHaveBeenCalledWith({ data: { phone: 'p', code_hash: 'h', purpose: 'LOGIN', expires_at: expiresAt } });
  });

  it('findById', async () => {
    db.otpRequest.findUnique.mockResolvedValue(null);
    expect(await repo.findById(db, 'x')).toBeNull();
    expect(db.otpRequest.findUnique).toHaveBeenCalledWith({ where: { id: 'x' } });
  });

  it('incrementAttempts', async () => {
    await repo.incrementAttempts(db, 'x');
    expect(db.otpRequest.update).toHaveBeenCalledWith({ where: { id: 'x' }, data: { attempts: { increment: 1 } } });
  });

  it('markConsumed / markVerified set timestamps', async () => {
    await repo.markConsumed(db, 'x');
    expect(db.otpRequest.update.mock.calls[0][0].data.consumed_at).toBeInstanceOf(Date);
    await repo.markVerified(db, 'x');
    expect(db.otpRequest.update.mock.calls[1][0].data.verified_at).toBeInstanceOf(Date);
  });
});
