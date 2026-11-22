import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleContextType } from '@prisma/client';
import { MEDIA_CONSTANTS } from '../../../shared/config/constants';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { assertValidMediaFiles } from '../../../shared/kernel/storage/media-file-validator';
import { buildMemoryMulterOptions } from '../../../shared/kernel/storage/multer.config';
import { toUploadedMediaFile } from '../../../shared/kernel/storage/multer-file.mapper';
import { AdminWithdrawalsUseCase, AdminWithdrawalView } from '../application/admin-withdrawals.use-case';
import { ListWithdrawalsQueryDto } from './dto/list-withdrawals-query.dto';
import { RejectWithdrawalDto } from './dto/reject-withdrawal.dto';

/** ADMIN review of manual wallet withdrawals (the transfer itself happens outside the system). */
@ApiTags('withdrawals')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(@Inject(AdminWithdrawalsUseCase) private readonly admin: AdminWithdrawalsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Admin: withdrawal requests, optionally filtered by status' })
  list(@Query() query: ListWithdrawalsQueryDto): Promise<{ items: AdminWithdrawalView[] }> {
    return this.admin.list({ status: query.status, limit: query.limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin: one request, with the patient name and current wallet balance' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminWithdrawalView> {
    return this.admin.get(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', buildMemoryMulterOptions(MEDIA_CONSTANTS.MAX_DOCUMENT_SIZE_BYTES)))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Admin: mark as transferred, uploading the proof (jpeg/png/pdf, multipart field "file")' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<AdminWithdrawalView> {
    const uploaded = file ? [toUploadedMediaFile(file)] : [];
    assertValidMediaFiles(uploaded, {
      allowedMimeTypes: MEDIA_CONSTANTS.DOCUMENT_MIME_TYPES,
      maxFileSizeBytes: MEDIA_CONSTANTS.MAX_DOCUMENT_SIZE_BYTES,
      maxFileCount: 1,
    });
    return this.admin.complete(id, uploaded[0], user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin: reject with a reason — the amount returns to the patient wallet' })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectWithdrawalDto, @CurrentUser() user: AccessTokenPayload): Promise<AdminWithdrawalView> {
    return this.admin.reject(id, dto.reason, user);
  }
}
