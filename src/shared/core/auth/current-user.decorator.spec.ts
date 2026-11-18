import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

describe('CurrentUser decorator', () => {
  it('returns request.user from the HTTP context', () => {
    class Ctl {
      handler(@CurrentUser() _user: unknown) {
        return _user;
      }
    }
    const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, Ctl, 'handler');
    const factory = (Object.values(meta)[0] as any).factory;
    const user = { sub: 'u1' };
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ user }) }) };
    expect(factory(undefined, ctx)).toBe(user);
  });
});
