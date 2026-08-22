import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Gates an endpoint on `permissions.code` values (File 11 07.2's
 * authorization matrix, e.g. `prescriptions:review`). The caller's token
 * must carry every listed code (`AccessTokenPayload.permissions`).
 */
export const Permissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);
