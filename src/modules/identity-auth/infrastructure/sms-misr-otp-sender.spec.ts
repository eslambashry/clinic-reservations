import { buildOtpMessage } from '../domain/otp-message.util';
import { SmsMisrOtpSender } from './sms-misr-otp-sender';

describe('SmsMisrOtpSender', () => {
  function setup(hasTemplate: boolean) {
    const smsMisr = { hasOtpTemplate: jest.fn(() => hasTemplate), sendOtp: jest.fn(), sendSms: jest.fn() };
    return { smsMisr, sender: new SmsMisrOtpSender(smsMisr as any) };
  }

  it('uses the approved OTP template when one is configured, for either purpose', async () => {
    const { smsMisr, sender } = setup(true);

    await sender.send('+201001234567', '123456', 'PASSWORD_RESET');

    expect(smsMisr.sendOtp).toHaveBeenCalledWith('+201001234567', '123456');
    expect(smsMisr.sendSms).not.toHaveBeenCalled();
  });

  it('falls back to free text through the SMS API while no template is configured', async () => {
    const { smsMisr, sender } = setup(false);

    await sender.send('+201001234567', '123456', 'LOGIN_OR_SIGNUP');

    expect(smsMisr.sendSms).toHaveBeenCalledWith('+201001234567', buildOtpMessage('123456', 'LOGIN_OR_SIGNUP'));
    expect(smsMisr.sendOtp).not.toHaveBeenCalled();
  });
});
