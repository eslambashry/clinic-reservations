import { buildOtpMessage } from './otp-message.util';

describe('buildOtpMessage', () => {
  it('words login and password-reset codes differently and always includes the code', () => {
    const login = buildOtpMessage('123456', 'LOGIN_OR_SIGNUP');
    const reset = buildOtpMessage('654321', 'PASSWORD_RESET');

    expect(login).toContain('123456');
    expect(reset).toContain('654321');
    expect(reset).toContain('تغيير كلمة المرور');
    expect(login).not.toContain('كلمة المرور');
  });

  it('fits in one UCS-2 SMS segment (70 chars) for both purposes', () => {
    expect([...buildOtpMessage('123456', 'LOGIN_OR_SIGNUP')].length).toBeLessThanOrEqual(70);
    expect([...buildOtpMessage('123456', 'PASSWORD_RESET')].length).toBeLessThanOrEqual(70);
  });
});
