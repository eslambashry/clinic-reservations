import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PROVIDER_REGISTRATION_CONSTANTS, REGION_CONSTANTS } from '../../config/constants';
import { DomainError } from '../../core/errors/domain-errors';
import { PolicyConfigReader } from './policy-config.reader';

export interface ServiceFee {
  /** Fixed 2-decimal string, e.g. "12.00". */
  amount: string;
  currency: string;
}

/**
 * The flat per-booking service fee (`SERVICE_FEE` policy). One place that
 * reads and validates it, so a missing/malformed policy is a loud 500
 * rather than a silent zero-fee booking.
 */
@Injectable()
export class ServiceFeeReader {
  constructor(@Inject(PolicyConfigReader) private readonly policyConfig: PolicyConfigReader) {}

  async get(tx: Prisma.TransactionClient): Promise<ServiceFee> {
    const value = await this.policyConfig.getValue<{ amount?: unknown }>(tx, REGION_CONSTANTS.DEFAULT_REGION_CODE, 'SERVICE_FEE');
    const amount = value?.amount;
    if (typeof amount !== 'string' || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      throw new DomainError(500, 'SERVICE_FEE_NOT_CONFIGURED', 'رسوم الخدمة غير مُهيّأة. تواصل مع الدعم.');
    }
    return { amount: Number(amount).toFixed(2), currency: PROVIDER_REGISTRATION_CONSTANTS.DEFAULT_CURRENCY };
  }
}
