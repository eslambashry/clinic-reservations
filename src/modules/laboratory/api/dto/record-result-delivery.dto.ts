import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DeliveryMethod, ResultRecipientRole } from '../../application/record-result-delivery.use-case';

const RECIPIENT_ROLES: ResultRecipientRole[] = ['patient', 'doctor', 'other'];
const DELIVERY_METHODS: DeliveryMethod[] = ['whatsapp', 'email', 'in_person', 'other'];

/** Staff self-attestation only — no delivery channel exists (DEC-004). */
export class RecordResultDeliveryDto {
  @ApiProperty({ enum: RECIPIENT_ROLES })
  @IsIn(RECIPIENT_ROLES)
  recipientRole: ResultRecipientRole;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  recipientName: string;

  @ApiProperty({ enum: DELIVERY_METHODS })
  @IsIn(DELIVERY_METHODS)
  method: DeliveryMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
