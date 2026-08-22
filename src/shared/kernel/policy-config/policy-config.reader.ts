import { Injectable } from '@nestjs/common';
import { PolicyType, Prisma } from '@prisma/client';

/**
 * Read-only access to `policy_configs` (File 11 Part 03's "Admin/Policy
 * Config" conceptual module — no write-side/Admin CRUD module exists yet,
 * File 12 Part 36.1, so this is deliberately minimal shared infra, not a
 * module-boundary violation). `effective_from <= now()` + `desc` means a
 * future-dated policy change only takes effect once its date arrives —
 * forward-looking correctness for whenever a second row per
 * region/policy_type is ever inserted, not dead code today.
 */
@Injectable()
export class PolicyConfigReader {
  async getValue<T>(tx: Prisma.TransactionClient, regionCode: string, policyType: PolicyType): Promise<T | null> {
    const row = await tx.policyConfig.findFirst({
      where: { region_code: regionCode, policy_type: policyType, effective_from: { lte: new Date() } },
      orderBy: { effective_from: 'desc' },
    });
    return (row?.value as T) ?? null;
  }
}
