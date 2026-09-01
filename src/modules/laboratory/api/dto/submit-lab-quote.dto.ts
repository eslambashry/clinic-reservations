import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsDecimal, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * The staff reply that approves a request (Discovery §8.3): price,
 * appointment, preparation instructions, and the patient's queue slot for
 * the day — flat, same shape pharmacy's own quote already resolved to
 * (no per-test pricing).
 */
export class SubmitLabQuoteDto {
  @ApiProperty({ example: '450.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  totalPrice: string;

  @ApiProperty({ description: 'ISO-8601 appointment instant, must be in the future.' })
  @IsDateString()
  appointmentAt: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  prepInstructions: string;

  @ApiProperty({ minimum: 1, example: 12 })
  @IsInt()
  @Min(1)
  @Max(9999)
  queueNumber: number;
}
