import { Inject, Injectable } from '@nestjs/common';
import { PolicyType } from '@prisma/client';
import { REGION_CONSTANTS } from '../../config/constants';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyConfigRepository } from './policy-config.repository';

export interface PolicyConfigSummary {
  id: string;
  regionCode: string;
  policyType: PolicyType;
  value: unknown;
  effectiveFrom: string;
  createdBy: string | null;
}

export interface ListPolicyConfigsResult {
  policies: PolicyConfigSummary[];
}

/** Admin read of the policies currently in force for a region (File 12 Part 36.1). */
@Injectable()
export class ListPolicyConfigsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PolicyConfigRepository) private readonly policyConfigs: PolicyConfigRepository,
  ) {}

  async execute(regionCode?: string): Promise<ListPolicyConfigsResult> {
    const rows = await this.policyConfigs.findEffective(this.prisma, regionCode ?? REGION_CONSTANTS.DEFAULT_REGION_CODE);
    return {
      policies: rows.map((row) => ({
        id: row.id,
        regionCode: row.region_code,
        policyType: row.policy_type,
        value: row.value,
        effectiveFrom: row.effective_from.toISOString(),
        createdBy: row.created_by,
      })),
    };
  }
}
