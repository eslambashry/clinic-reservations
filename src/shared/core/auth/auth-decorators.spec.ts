import { IS_OPTIONAL_AUTH_KEY, OptionalAuth } from './optional-auth.decorator';
import { PERMISSIONS_KEY, Permissions } from './permissions.decorator';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { ROLES_KEY, Roles } from './roles.decorator';

describe('auth metadata decorators', () => {
  it('@Public sets the public flag', () => {
    class C {
      @Public() a() {}
    }
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, C.prototype.a)).toBe(true);
  });

  it('@OptionalAuth sets the optional flag', () => {
    class C {
      @OptionalAuth() a() {}
    }
    expect(Reflect.getMetadata(IS_OPTIONAL_AUTH_KEY, C.prototype.a)).toBe(true);
  });

  it('@Permissions stores the codes', () => {
    class C {
      @Permissions('x:y', 'z:w') a() {}
    }
    expect(Reflect.getMetadata(PERMISSIONS_KEY, C.prototype.a)).toEqual(['x:y', 'z:w']);
  });

  it('@Roles stores the contexts', () => {
    class C {
      @Roles('DOCTOR' as any, 'ADMIN' as any) a() {}
    }
    expect(Reflect.getMetadata(ROLES_KEY, C.prototype.a)).toEqual(['DOCTOR', 'ADMIN']);
  });
});
