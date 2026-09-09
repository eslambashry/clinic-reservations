import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, ValidateNested } from 'class-validator';
import { NotificationTier } from '@prisma/client';

const CHANNELS = ['PUSH', 'SMS'] as const;

export class NotificationPreferenceItemDto {
  @ApiProperty({ enum: NotificationTier })
  @IsEnum(NotificationTier)
  tier: NotificationTier;

  @ApiProperty({ enum: CHANNELS })
  @IsIn(CHANNELS)
  channel: (typeof CHANNELS)[number];

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

/** File 10 §11 `PUT /v1/notifications/preferences` — bulk upsert; `SAFETY_CRITICAL` with `enabled:false` 422s (`UpdateNotificationPreferencesUseCase`). */
export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences: NotificationPreferenceItemDto[];
}
