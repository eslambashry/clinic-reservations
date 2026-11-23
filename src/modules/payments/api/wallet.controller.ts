import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { GetWalletUseCase, WalletSummary } from '../application/get-wallet.use-case';
import { InitiateWalletTopUpUseCase, InitiateWalletTopUpResult } from '../application/initiate-wallet-top-up.use-case';
import { ListWalletTransactionsUseCase, ListWalletTransactionsResult } from '../application/list-wallet-transactions.use-case';
import { ManageMyWithdrawalsUseCase } from '../application/manage-my-withdrawals.use-case';
import { RequestWithdrawalUseCase } from '../application/request-withdrawal.use-case';
import { WithdrawalView } from '../application/withdrawal.mapper';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
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
    @Inject(RequestWithdrawalUseCase) private readonly requestWithdrawal: RequestWithdrawalUseCase,
    @Inject(ManageMyWithdrawalsUseCase) private readonly myWithdrawals: ManageMyWithdrawalsUseCase,
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

  @Post('withdrawals')
  @HttpCode(201)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Request a manual withdrawal — debits the balance immediately; one PENDING request at a time' })
  createWithdrawal(@Body() dto: CreateWithdrawalDto, @CurrentUser() user: AccessTokenPayload): Promise<WithdrawalView> {
    return this.requestWithdrawal.execute({
      userId: user.sub,
      amount: dto.amount,
      accountHolderName: dto.accountHolderName,
      payoutMethod: dto.payoutMethod,
      payoutAccount: dto.payoutAccount,
    });
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'My withdrawal requests (newest first)' })
  listWithdrawals(@CurrentUser() user: AccessTokenPayload): Promise<{ items: WithdrawalView[] }> {
    return this.myWithdrawals.list(user.sub);
  }

  @Post('withdrawals/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel my PENDING withdrawal — the amount returns to the wallet' })
  cancelWithdrawal(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessTokenPayload): Promise<WithdrawalView> {
    return this.myWithdrawals.cancel(user.sub, id);
  }
}
