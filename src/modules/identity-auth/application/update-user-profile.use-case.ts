import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRepository } from '../infrastructure/user.repository';

export interface UpdateUserProfileInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * identity-auth's only cross-module write export (File 11 Part 03: no other
 * module reaches into `users` directly). Takes `tx: Prisma.TransactionClient`
 * explicitly, same pattern as `GetAffiliationBillingInfoUseCase` — a caller
 * like `SelfRegisterProviderUseCase` needs this update to commit atomically
 * with the rest of its own transaction, not in a separate one.
 *
 * `email` is unique on `User`; a conflict (P2002) is swallowed rather than
 * failing the whole caller transaction — best-effort profile enrichment,
 * never a hard requirement of whatever wrote it.
 */
@Injectable()
export class UpdateUserProfileUseCase {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  async execute(tx: Prisma.TransactionClient, input: UpdateUserProfileInput): Promise<void> {
    const { userId, ...fields } = input;
    if (fields.firstName === undefined && fields.lastName === undefined && fields.email === undefined) {
      return;
    }

    try {
      await this.users.updateProfile(tx, userId, fields);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && fields.email !== undefined) {
        const { email: _dropped, ...withoutEmail } = fields;
        if (withoutEmail.firstName !== undefined || withoutEmail.lastName !== undefined) {
          await this.users.updateProfile(tx, userId, withoutEmail);
        }
        return;
      }
      throw error;
    }
  }
}
