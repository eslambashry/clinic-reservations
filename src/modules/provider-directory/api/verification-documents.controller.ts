import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProviderVerificationDocument, RoleContextType } from '@prisma/client';
import { ApproveVerificationDocumentUseCase } from '../application/approve-verification-document.use-case';
import { ListVerificationDocumentsResult, ListVerificationDocumentsUseCase } from '../application/list-verification-documents.use-case';
import { RejectVerificationDocumentUseCase } from '../application/reject-verification-document.use-case';
import { UploadVerificationDocumentUseCase } from '../application/upload-verification-document.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
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
    private readonly uploadDocument: UploadVerificationDocumentUseCase,
    private readonly listDocuments: ListVerificationDocumentsUseCase,
    private readonly approveDocument: ApproveVerificationDocumentUseCase,
    private readonly rejectDocument: RejectVerificationDocumentUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin review queue — filter by providerType/providerId/status, cursor-paginated' })
  list(@Query() query: ListVerificationDocumentsQueryDto): Promise<ListVerificationDocumentsResult> {
    return this.listDocuments.execute(query);
  }

  @Post()
  @ApiOperation({ summary: 'Admin: attach a verification document (fileUrl is pre-hosted, Part 32.7)' })
  upload(
    @Body() dto: CreateVerificationDocumentDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ProviderVerificationDocument> {
    return this.uploadDocument.execute(dto, user);
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
