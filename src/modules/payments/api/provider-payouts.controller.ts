import { Body, Controller, Get, HttpCode, Inject, Param, ParseEnumPipe, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProviderType, RoleContextType } from '@prisma/client';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { GetProviderOutstandingBalanceUseCase, GetProviderOutstandingBalanceResult } from '../application/get-provider-outstanding-balance.use-case';
import { RecordProviderPayoutUseCase, RecordProviderPayoutResult } from '../application/record-provider-payout.use-case';
import { RecordProviderPayoutDto } from './dto/record-provider-payout.dto';

/**
 * Admin-only. Doctor-focused today (only doctors ever accumulate an
 * `EARNING` balance under the current pay-at-clinic/pay-at-lab-only model
 * for pharmacy/lab) but kept generic over `ProviderType`, matching
 * `ProviderLedgerEntry`'s own existing shape — no schema change, no new
 * table. The actual money transfer happens outside this system; these
 * routes only let Admin see what's owed and record that a transfer happened.
 */
@ApiTags('provider-payouts')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('provider-payouts')
export class ProviderPayoutsController {
  constructor(
    @Inject(GetProviderOutstandingBalanceUseCase) private readonly getBalance: GetProviderOutstandingBalanceUseCase,
    @Inject(RecordProviderPayoutUseCase) private readonly recordPayout: RecordProviderPayoutUseCase,
  ) {}

  @Get(':providerType/:providerId')
  @ApiOperation({ summary: 'Outstanding balance MedSuper currently owes this provider (EARNING direction only)' })
  getOutstandingBalance(
    @Param('providerType', new ParseEnumPipe(ProviderType)) providerType: ProviderType,
    @Param('providerId', ParseUUIDPipe) providerId: string,
  ): Promise<GetProviderOutstandingBalanceResult> {
    return this.getBalance.execute(providerType, providerId);
  }

  @Post(':providerType/:providerId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record that Admin transferred money to this provider outside the system — reduces the outstanding balance' })
  recordPayoutRoute(
    @Param('providerType', new ParseEnumPipe(ProviderType)) providerType: ProviderType,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() dto: RecordProviderPayoutDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<RecordProviderPayoutResult> {
    return this.recordPayout.execute({ providerType, providerId, amount: dto.amount, note: dto.note }, user);
  }
}
