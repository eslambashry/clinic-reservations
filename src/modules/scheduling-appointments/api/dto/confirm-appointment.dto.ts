import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

/** File 12 Part 35.4: `ONLINE` is accepted by the DTO (File 10 §2.3's documented contract shape) but rejected by the use-case — `422 PAYMENT_METHOD_NOT_SUPPORTED`, only `PAY_AT_CLINIC` is implemented. */
export class ConfirmAppointmentDto {
  @ApiProperty({ enum: ['PAY_AT_CLINIC', 'ONLINE'] })
  @IsIn(['PAY_AT_CLINIC', 'ONLINE'])
  paymentMethod: 'PAY_AT_CLINIC' | 'ONLINE';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentIntentId?: string;
}
