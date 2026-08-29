import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRepository } from '../infrastructure/user.repository';

export interface UserSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  /** Last 3 digits visible, everything else masked — no existing masking utility to reuse anywhere in this codebase yet. */
  phoneMasked: string;
}

function maskPhone(phone: string): string {
  const visible = phone.slice(-3);
  return `${'*'.repeat(Math.max(phone.length - 3, 0))}${visible}`;
}

/**
 * 2026-08-29 addition — `pharmacy-fulfillment`'s `GetPharmacyOrderUseCase`
 * needs a PHI-minimal patient/doctor projection for its order-detail
 * response, and no cross-module export for "look up a user by id" existed
 * yet (`identity-auth` owns `users`, File 12 Part 05 — no cross-module table
 * reach). Plain lookup, no ownership/authorization check — same "caller
 * already legitimately owns this id via its own rows" reasoning as
 * `GetPrescriptionItemDrugCodesUseCase`; the authorization boundary (is the
 * caller entitled to see this order at all) is enforced by the caller.
 */
@Injectable()
export class GetUserSummaryUseCase {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  async execute(tx: Prisma.TransactionClient, userId: string): Promise<UserSummary | null> {
    const user = await this.users.findById(tx, userId);
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      phoneMasked: maskPhone(user.phone),
    };
  }
}
