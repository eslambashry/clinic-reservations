import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { NOTIFICATION_CONSTANTS } from '../../../shared/config/constants';
import { GetNotificationPreferencesUseCase, NotificationPreferenceView } from '../application/get-notification-preferences.use-case';
import { ListNotificationsResult, ListNotificationsUseCase } from '../application/list-notifications.use-case';
import { MarkNotificationReadResult, MarkNotificationReadUseCase } from '../application/mark-notification-read.use-case';
import { UpdateNotificationPreferencesUseCase } from '../application/update-notification-preferences.use-case';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

/** File 11 Part 05.9 — every route self-scoped to the caller; no admin/global listing exists here. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(ListNotificationsUseCase) private readonly listNotifications: ListNotificationsUseCase,
    @Inject(MarkNotificationReadUseCase) private readonly markRead: MarkNotificationReadUseCase,
    @Inject(GetNotificationPreferencesUseCase) private readonly getPreferences: GetNotificationPreferencesUseCase,
    @Inject(UpdateNotificationPreferencesUseCase) private readonly updatePreferences: UpdateNotificationPreferencesUseCase,
  ) {}

  @Get()
  list(@Query() query: ListNotificationsQueryDto, @CurrentUser() user: AccessTokenPayload): Promise<ListNotificationsResult> {
    return this.listNotifications.execute({
      userId: user.sub,
      unreadOnly: query.unreadOnly,
      cursor: query.cursor,
      limit: query.limit ?? NOTIFICATION_CONSTANTS.DEFAULT_LIST_LIMIT,
    });
  }

  @Patch(':id/read')
  @HttpCode(200)
  read(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessTokenPayload): Promise<MarkNotificationReadResult> {
    return this.markRead.execute(id, user.sub);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AccessTokenPayload): Promise<NotificationPreferenceView[]> {
    return this.getPreferences.execute(user.sub);
  }

  @Put('preferences')
  @HttpCode(204)
  async updatePreferencesEndpoint(@Body() dto: UpdateNotificationPreferencesDto, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.updatePreferences.execute(user.sub, dto.preferences);
  }
}
