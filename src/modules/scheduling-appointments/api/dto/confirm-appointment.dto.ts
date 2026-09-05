import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * File 12 Part 35.4 / Part 50.4: `ONLINE` is still accepted by the DTO
 * (File 10 §2.3's documented contract shape) but rejected by the use-case —
 * `422 PAYMENT_METHOD_NOT_SUPPORTED`. `CARD`/`FAWRY`/`MOBILE_WALLET` never
 * go through this endpoint at all — they're asynchronous and go through
 * `POST /v1/appointments/{holdId}/payments`
 * (`InitiateOnlineAppointmentPaymentUseCase`) instead, confirming only once
 * a webhook reports success. `INTERNAL_WALLET` IS synchronous, like
 * `PAY_AT_CLINIC`, so it's confirmed here, immediately, in one call.
 */
export class ConfirmAppointmentDto {
  @ApiProperty({ enum: ['PAY_AT_CLINIC', 'INTERNAL_WALLET', 'ONLINE'] })
  @IsIn(['PAY_AT_CLINIC', 'INTERNAL_WALLET', 'ONLINE'])
  paymentMethod: 'PAY_AT_CLINIC' | 'INTERNAL_WALLET' | 'ONLINE';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentIntentId?: string;
}
