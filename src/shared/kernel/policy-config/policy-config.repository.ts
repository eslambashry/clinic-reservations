import { Injectable } from '@nestjs/common';
import { PolicyConfig, PolicyType, Prisma } from '@prisma/client';

export interface UpsertPolicyConfigParams {
  regionCode: string;
  policyType: PolicyType;
  value: Prisma.InputJsonValue;
  createdBy: string;
}

/**
 * Write/list side of `policy_configs`, added alongside `PolicyConfigReader`
 * (which stays untouched — every payment and notification read goes through
 * it, File 12 Part 36.1). Prisma access for this table lives only here.
 */
@Injectable()
export class PolicyConfigRepository {
  /**
   * The currently effective row per `policy_type` for a region — same
   * `effective_from <= now()` + `desc` selection `PolicyConfigReader` uses,
   * so the list an admin sees is exactly what the payment/notification read
   * path resolves. Distinct on `policy_type` is done here rather than in
   * SQL because the table holds at most a handful of rows per region.
   */
  async findEffective(db: Prisma.TransactionClient, regionCode: string): Promise<PolicyConfig[]> {
    const rows = await db.policyConfig.findMany({
      where: { region_code: regionCode, effective_from: { lte: new Date() } },
      orderBy: [{ policy_type: 'asc' }, { effective_from: 'desc' }],
    });

    const effective = new Map<PolicyType, PolicyConfig>();
    for (const row of rows) {
      if (!effective.has(row.policy_type)) {
        effective.set(row.policy_type, row);
      }
    }
    return [...effective.values()];
  }

  findCurrent(db: Prisma.TransactionClient, regionCode: string, policyType: PolicyType): Promise<PolicyConfig | null> {
    return db.policyConfig.findFirst({
      where: { region_code: regionCode, policy_type: policyType, effective_from: { lte: new Date() } },
      orderBy: { effective_from: 'desc' },
    });
  }

  create(db: Prisma.TransactionClient, params: UpsertPolicyConfigParams): Promise<PolicyConfig> {
    return db.policyConfig.create({
      data: {
        region_code: params.regionCode,
        policy_type: params.policyType,
        value: params.value,
        created_by: params.createdBy,
      },
    });
  }
}
