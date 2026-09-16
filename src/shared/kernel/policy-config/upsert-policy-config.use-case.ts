import { Inject, Injectable } from '@nestjs/common';
import { PolicyType, Prisma } from '@prisma/client';
import { AuditService } from '../../../modules/audit/application/audit.service';
import { AccessTokenPayload } from '../../core/auth/jwt-payload.interface';
import { REGION_CONSTANTS } from '../../config/constants';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyConfigSummary } from './list-policy-configs.use-case';
import { validatePolicyValue } from './policy-config.rules';
import { PolicyConfigRepository } from './policy-config.repository';

export interface UpsertPolicyConfigInput {
  policyType: PolicyType;
  regionCode?: string;
  value: unknown;
}

/**
 * Admin write for `policy_configs` (File 12 Part 36.1 — the table has
 * carried `created_by` for this since it was designed).
 *
 * Inserts a new row effective now rather than mutating the existing one:
 * `PolicyConfigReader` resolves "latest `effective_from <= now()`", so an
 * append leaves that read path byte-for-byte unchanged while preserving the
 * previous value as history. That also means no optimistic-lock update is
 * involved (R5 governs updates to a stateful row; this is an insert), and
 * no soft delete (R6) — a superseded row stays readable as history.
 *
 * The audit write shares the SAME `tx` as the insert (File 12 Part 32.15),
 * so a policy change can never be recorded without having taken effect.
 */
@Injectable()
export class UpsertPolicyConfigUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PolicyConfigRepository) private readonly policyConfigs: PolicyConfigRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async execute(input: UpsertPolicyConfigInput, actor: AccessTokenPayload): Promise<PolicyConfigSummary> {
    const regionCode = input.regionCode ?? REGION_CONSTANTS.DEFAULT_REGION_CODE;
    const value = validatePolicyValue(input.policyType, input.value);

    return this.prisma.$transaction(async (tx) => {
      const previous = await this.policyConfigs.findCurrent(tx, regionCode, input.policyType);

      const created = await this.policyConfigs.create(tx, {
        regionCode,
        policyType: input.policyType,
        value: value as unknown as Prisma.InputJsonValue,
        createdBy: actor.sub,
      });

      await this.audit.record(tx, {
        actorUserId: actor.sub,
        actorRoleMembershipId: actor.roleMembershipId,
        action: 'policy-config.policy_config.upsert',
        resourceType: 'policy_config',
        resourceId: created.id,
        reasonCode: previous ? `previous_value:${JSON.stringify(previous.value)}` : 'previous_value:none',
      });

      return {
        id: created.id,
        regionCode: created.region_code,
        policyType: created.policy_type,
        value: created.value,
        effectiveFrom: created.effective_from.toISOString(),
        createdBy: created.created_by,
      };
    });
  }
}
