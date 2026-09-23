import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class ProviderPrescriptionItemDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  drugNameFreeText: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dose?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  frequency?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiProperty({ minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateProviderPrescriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ type: [ProviderPrescriptionItemDto], minItems: 1, maxItems: 30 })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProviderPrescriptionItemDto)
  items: ProviderPrescriptionItemDto[];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;
}

export class CreateProviderPrescriptionBatchDto {
  @ApiProperty({ type: [CreateProviderPrescriptionDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateProviderPrescriptionDto)
  requests: CreateProviderPrescriptionDto[];
}
