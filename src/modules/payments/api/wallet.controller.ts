import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { GetWalletUseCase, WalletSummary } from '../application/get-wallet.use-case';
import { InitiateWalletTopUpUseCase, InitiateWalletTopUpResult } from '../application/initiate-wallet-top-up.use-case';
import { ListWalletTransactionsUseCase, ListWalletTransactionsResult } from '../application/list-wallet-transactions.use-case';
import { ListWalletTransactionsQueryDto } from './dto/list-wallet-transactions-query.dto';
import { TopUpWalletDto } from './dto/top-up-wallet.dto';

/**
 * File 12 Part 50.3: the internal MedSuper prepaid wallet — patient-facing
 * only. Balance/history are read-only projections of `wallet_transactions`
 * (File 11 Part 11 concurrency rules mean the balance itself is never
 * written from this controller — only `ProcessWalletTopUpUseCase`,
 * `CaptureInternalWalletPaymentUseCase`, and refund crediting touch it).
 */
@ApiTags('wallet')
@ApiBearerAuth()
@Roles(RoleContextType.PATIENT)
@Controller('wallet')
export class WalletController {
  constructor(
    @Inject(GetWalletUseCase) private readonly getWallet: GetWalletUseCase,
    @Inject(InitiateWalletTopUpUseCase) private readonly initiateTopUp: InitiateWalletTopUpUseCase,
    @Inject(ListWalletTransactionsUseCase) private readonly listTransactions: ListWalletTransactionsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current wallet balance (File 12 Part 50.3)' })
  get(@CurrentUser() user: AccessTokenPayload): Promise<WalletSummary> {
    return this.getWallet.execute(user.sub);
  }

  @Post('top-up')
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Initiate a card top-up — returns a Paymob iframe URL; balance only increases once the webhook confirms capture' })
  topUp(@Body() dto: TopUpWalletDto, @CurrentUser() user: AccessTokenPayload): Promise<InitiateWalletTopUpResult> {
    return this.initiateTopUp.execute({ userId: user.sub, amount: dto.amount, customer: dto.customer });
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Wallet ledger / transaction history (File 12 Part 50.3)' })
  listWalletTransactions(
    @Query() query: ListWalletTransactionsQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ListWalletTransactionsResult> {
    return this.listTransactions.execute({ userId: user.sub, cursor: query.cursor, limit: query.limit ?? 20 });
  }
}
