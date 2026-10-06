import { generateOtpCode, hashOtpCode, verifyOtpCode } from './otp-code.util';

describe('otp-code.util', () => {
  it('generates a 6-digit numeric code', () => {
    for (let i = 0; i < 20; i++) expect(generateOtpCode()).toMatch(/^[1-9]\d{5}$/);
  });
  it('hashes and verifies', async () => {
    const hash = await hashOtpCode('123456');
    expect(hash).not.toBe('123456');
    expect(await verifyOtpCode(hash, '123456')).toBe(true);
    expect(await verifyOtpCode(hash, '654321')).toBe(false);
  });
});
