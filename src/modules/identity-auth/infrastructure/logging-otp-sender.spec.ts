import { Logger } from '@nestjs/common';
import { LoggingOtpSender } from './logging-otp-sender';

describe('LoggingOtpSender', () => {
  it('logs a dev warning containing the code', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await new LoggingOtpSender().send('+20100', '123456', 'LOGIN' as any);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('123456'));
    warn.mockRestore();
  });
});
