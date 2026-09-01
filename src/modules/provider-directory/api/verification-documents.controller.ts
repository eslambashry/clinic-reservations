import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProviderVerificationDocument, RoleContextType } from '@prisma/client';
import { ApproveVerificationDocumentUseCase } from '../application/approve-verification-document.use-case';
import { ListVerificationDocumentsResult, ListVerificationDocumentsUseCase } from '../application/list-verification-documents.use-case';
import { RejectVerificationDocumentUseCase } from '../application/reject-verification-document.use-case';
import { UploadVerificationDocumentUseCase } from '../application/upload-verification-document.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { MEDIA_CONSTANTS } from '../../../shared/config/constants';
import { assertValidMediaFiles } from '../../../shared/kernel/storage/media-file-validator';
import { buildMemoryMulterOptions } from '../../../shared/kernel/storage/multer.config';
import { toUploadedMediaFile } from '../../../shared/kernel/storage/multer-file.mapper';
import { CreateVerificationDocumentDto } from './dto/create-verification-document.dto';
import { ListVerificationDocumentsQueryDto } from './dto/list-verification-documents-query.dto';
import { RejectVerificationDocumentDto } from './dto/reject-verification-document.dto';

/** File 11 07.3: manual KYC review — Admin-only end to end, no public/provider read (File 12 Part 32.4). */
@ApiTags('provider-verification-documents')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('provider-verification-documents')
export class VerificationDocumentsController {
  constructor(
    @Inject(UploadVerificationDocumentUseCase) private readonly uploadDocument: UploadVerificationDocumentUseCase,
    @Inject(ListVerificationDocumentsUseCase) private readonly listDocuments: ListVerificationDocumentsUseCase,
    @Inject(ApproveVerificationDocumentUseCase) private readonly approveDocument: ApproveVerificationDocumentUseCase,
    @Inject(RejectVerificationDocumentUseCase) private readonly rejectDocument: RejectVerificationDocumentUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin review queue — filter by providerType/providerId/status, cursor-paginated' })
  list(@Query() query: ListVerificationDocumentsQueryDto): Promise<ListVerificationDocumentsResult> {
    return this.listDocuments.execute(query);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', buildMemoryMulterOptions(MEDIA_CONSTANTS.MAX_DOCUMENT_SIZE_BYTES)))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        providerType: { type: 'string', enum: ['DOCTOR', 'CLINIC', 'PHARMACY', 'LAB'] },
        providerId: { type: 'string', format: 'uuid' },
        docType: { type: 'string', example: 'MEDICAL_LICENSE' },
      },
    },
  })
  @ApiOperation({ summary: 'Admin: attach a verification document — multipart upload, jpeg/png/pdf, stored private (Part 32.7 superseded by ImageKit)' })
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateVerificationDocumentDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ProviderVerificationDocument> {
    const uploadedFiles = file ? [toUploadedMediaFile(file)] : [];
    assertValidMediaFiles(uploadedFiles, {
      allowedMimeTypes: MEDIA_CONSTANTS.DOCUMENT_MIME_TYPES,
      maxFileSizeBytes: MEDIA_CONSTANTS.MAX_DOCUMENT_SIZE_BYTES,
      maxFileCount: 1,
    });

    return this.uploadDocument.execute({ ...dto, file: uploadedFiles[0] }, user);
  }

  @Post(':documentId/approve')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: approve a document (does not itself verify the provider, Part 32.3)' })
  async approve(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.approveDocument.execute(documentId, user);
  }

  @Post(':documentId/reject')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: reject a document' })
  async reject(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: RejectVerificationDocumentDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.rejectDocument.execute(documentId, dto.reasonCode, user);
  }
}
