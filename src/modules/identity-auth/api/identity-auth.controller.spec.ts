import { IdentityAuthController } from './identity-auth.controller';

describe('IdentityAuthController', () => {
  const names = [
    'requestOtp', 'verifyOtp', 'refreshToken', 'logout', 'getCurrentUser', 'setPassword', 'loginWithPassword',
    'forgotPassword', 'resetPassword', 'verifyResetCode', 'updateCurrentUser', 'switchContext', 'registerDevice', 'unregisterDevice',
  ];
  const uc: Record<string, { execute: jest.Mock }> = {};
  for (const n of names) uc[n] = { execute: jest.fn().mockResolvedValue({ from: n }) };
  const controller = new (IdentityAuthController as any)(...names.map((n) => uc[n])) as IdentityAuthController;
  const payload: any = { sub: 'u1', sid: 's1', roleCode: 'PATIENT' };
  beforeEach(() => names.forEach((n) => uc[n].execute.mockClear()));

  it('request forwards phone and ip', async () => {
    expect(await controller.request({ phone: '+20' } as any, { ip: '1.1.1.1' } as any)).toEqual({ from: 'requestOtp' });
    expect(uc.requestOtp.execute).toHaveBeenCalledWith({ phone: '+20', ip: '1.1.1.1' });
  });

  it('verify', async () => {
    await controller.verify({ requestId: 'r', code: '1' } as any);
    expect(uc.verifyOtp.execute).toHaveBeenCalledWith({ requestId: 'r', code: '1' });
  });

  it('refresh', async () => {
    await controller.refresh({ refreshToken: 't' } as any);
    expect(uc.refreshToken.execute).toHaveBeenCalledWith({ refreshToken: 't' });
  });

  it('signOut returns void', async () => {
    expect(await controller.signOut({ refreshToken: 't', allDevices: true, fcmToken: 'f' } as any)).toBeUndefined();
    expect(uc.logout.execute).toHaveBeenCalledWith({ refreshToken: 't', allDevices: true, fcmToken: 'f' });
  });

  it('me', async () => {
    await controller.me(payload);
    expect(uc.getCurrentUser.execute).toHaveBeenCalledWith({ userId: 'u1', activeRoleCode: 'PATIENT' });
  });

  it('registerDevice', async () => {
    await controller.registerDevice(payload, { fcmToken: 'f', platform: 'ios', appVersion: '1' } as any);
    expect(uc.registerDevice.execute).toHaveBeenCalledWith({ userId: 'u1', sessionId: 's1', fcmToken: 'f', platform: 'ios', appVersion: '1' });
  });

  it('unregisterDevice', async () => {
    expect(await controller.unregisterDevice(payload, { fcmToken: 'f' } as any)).toBeUndefined();
    expect(uc.unregisterDevice.execute).toHaveBeenCalledWith('u1', 's1', 'f');
  });

  it('switchContext', async () => {
    await controller.switchContext(payload, { contextType: 'DOCTOR' } as any);
    expect(uc.switchContext.execute).toHaveBeenCalledWith('u1', { contextType: 'DOCTOR' }, 's1');
  });

  it('updateMe', async () => {
    await controller.updateMe(payload, { display_name: 'n', email: 'e' } as any);
    expect(uc.updateCurrentUser.execute).toHaveBeenCalledWith({ userId: 'u1', activeRoleCode: 'PATIENT', displayName: 'n', email: 'e' });
  });

  it('setPasswordEndpoint', async () => {
    expect(await controller.setPasswordEndpoint(payload, { password: 'p' } as any)).toBeUndefined();
    expect(uc.setPassword.execute).toHaveBeenCalledWith({ userId: 'u1', password: 'p' });
  });

  it('loginWithPasswordEndpoint', async () => {
    await controller.loginWithPasswordEndpoint({ phone: '+20', password: 'p' } as any, { role: 'DOCTOR' } as any);
    expect(uc.loginWithPassword.execute).toHaveBeenCalledWith({ phone: '+20', password: 'p', role: 'DOCTOR' });
  });

  it('forgotPasswordEndpoint', async () => {
    await controller.forgotPasswordEndpoint({ phone: '+20' } as any, { ip: '2.2.2.2' } as any);
    expect(uc.forgotPassword.execute).toHaveBeenCalledWith({ phone: '+20', ip: '2.2.2.2' });
  });

  it('resetPasswordEndpoint', async () => {
    expect(await controller.resetPasswordEndpoint({ requestId: 'r', newPassword: 'n' } as any)).toBeUndefined();
    expect(uc.resetPassword.execute).toHaveBeenCalledWith({ requestId: 'r', newPassword: 'n' });
  });

  it('verifyResetCodeEndpoint', async () => {
    await controller.verifyResetCodeEndpoint({ requestId: 'r', code: 'c' } as any);
    expect(uc.verifyResetCode.execute).toHaveBeenCalledWith({ requestId: 'r', code: 'c' });
  });
});
