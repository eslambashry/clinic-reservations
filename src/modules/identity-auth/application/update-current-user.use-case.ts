import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { GetCurrentUserResult, GetCurrentUserUseCase } from './get-current-user.use-case';
import { UpdateUserProfileUseCase } from './update-user-profile.use-case';

export interface UpdateCurrentUserInput {
  userId: string;
  activeRoleCode: string;
  displayName?: string;
  email?: string;
}

/** Mirrors `SelfRegisterProviderUseCase`'s `splitFullName` (File 12 Part 32.1): first token is the first name, the rest (if any) is the last name. */
function splitDisplayName(displayName: string): { firstName: string; lastName?: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.length > 0 ? rest.join(' ') : undefined };
}

/**
 * Backs `PATCH /v1/auth/me` (onboarding's "save name" step) — the one field
 * the Flutter client can self-edit today. Delegates the actual write to
 * `UpdateUserProfileUseCase` (identity-auth's only cross-module write
 * export) inside its own single-statement transaction, then re-reads via
 * `GetCurrentUserUseCase` so the response shape matches `GET /v1/auth/me`
 * exactly — the frontend's `UserDto.fromJson` is shared between both calls.
 */
@Injectable()
export class UpdateCurrentUserUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UpdateUserProfileUseCase) private readonly updateUserProfile: UpdateUserProfileUseCase,
    @Inject(GetCurrentUserUseCase) private readonly getCurrentUser: GetCurrentUserUseCase,
  ) {}

  async execute(input: UpdateCurrentUserInput): Promise<GetCurrentUserResult> {
    if (input.displayName !== undefined || input.email !== undefined) {
      const { firstName, lastName } =
        input.displayName !== undefined
          ? splitDisplayName(input.displayName)
          : { firstName: undefined, lastName: undefined };
      await this.prisma.$transaction(async (tx) => {
        await this.updateUserProfile.execute(tx, { userId: input.userId, firstName, lastName, email: input.email });
      });
    }

    return this.getCurrentUser.execute({ userId: input.userId, activeRoleCode: input.activeRoleCode });
  }
}
