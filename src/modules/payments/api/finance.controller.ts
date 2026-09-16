import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { FinanceSummary, GetFinanceSummaryUseCase } from '../application/get-finance-summary.use-case';
import {
  ListProviderLedgerEntriesResult,
  ListProviderLedgerEntriesUseCase,
} from '../application/list-provider-ledger-entries.use-case';
import { GetFinanceSummaryQueryDto } from './dto/get-finance-summary-query.dto';
import { ListProviderLedgerEntriesQueryDto } from './dto/list-provider-ledger-entries-query.dto';

/**
 * ADMIN finance read over `payment_splits` / `refunds` /
 * `provider_ledger_entries` (File 11 Part 13) — the first reader these
 * tables have had since capture started writing them. Separate controller
 * from `WalletController` because that one is `@Roles(PATIENT)` at class
 * level and an ADMIN token must never inherit it (RbacGuard matches the
 * context exactly — ADMIN is not a superuser).
 *
 * Every money field crosses the wire as a fixed-2-decimal string, never a
 * float or a bare `Decimal#toString()` (R15).
 */
@ApiTags('finance')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('finance')
export class FinanceController {
  constructor(
    @Inject(GetFinanceSummaryUseCase) private readonly getFinanceSummary: GetFinanceSummaryUseCase,
    @Inject(ListProviderLedgerEntriesUseCase) private readonly listLedgerEntries: ListProviderLedgerEntriesUseCase,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Admin: commission / provider-share / refund totals over an optional date range' })
  summary(@Query() query: GetFinanceSummaryQueryDto): Promise<FinanceSummary> {
    return this.getFinanceSummary.execute(query);
  }

  @Get('ledger')
  @ApiOperation({ summary: 'Admin: provider ledger entries, newest first' })
  ledger(@Query() query: ListProviderLedgerEntriesQueryDto): Promise<ListProviderLedgerEntriesResult> {
    return this.listLedgerEntries.execute(query);
  }
}
