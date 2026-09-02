import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RoleContextType } from '@prisma/client';
import { GetPrescriptionUseCase, PrescriptionDetail } from '../application/get-prescription.use-case';
import { ListPrescriptionsResult, ListPrescriptionsUseCase } from '../application/list-prescriptions.use-case';
import { ReviewPrescriptionResult, ReviewPrescriptionUseCase } from '../application/review-prescription.use-case';
import { UploadPrescriptionResult, UploadPrescriptionUseCase } from '../application/upload-prescription.use-case';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { MEDIA_CONSTANTS } from '../../../shared/config/constants';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';
import { assertValidMediaFiles } from '../../../shared/kernel/storage/media-file-validator';
import { buildMemoryMulterOptions } from '../../../shared/kernel/storage/multer.config';
import { toUploadedMediaFiles } from '../../../shared/kernel/storage/multer-file.mapper';
import { ListPrescriptionsQueryDto } from './dto/list-prescriptions-query.dto';
import { ReviewPrescriptionDto } from './dto/review-prescription.dto';
import { UploadPrescriptionDto } from './dto/upload-prescription.dto';

/**
 * File 11 05.7 / File 12 Part 37 — patient upload + detail, pharmacy-staff
 * review queue + review action. Mixed per-method roles (not a class-level
 * `@Roles()`) since PATIENT/PHARMACY_STAFF/ADMIN each get a different subset
 * of routes.
 */
@ApiTags('prescriptions')
@ApiBearerAuth()
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(
    @Inject(UploadPrescriptionUseCase) private readonly uploadPrescription: UploadPrescriptionUseCase,
    @Inject(GetPrescriptionUseCase) private readonly getPrescription: GetPrescriptionUseCase,
    @Inject(ListPrescriptionsUseCase) private readonly listPrescriptions: ListPrescriptionsUseCase,
    @Inject(ReviewPrescriptionUseCase) private readonly reviewPrescription: ReviewPrescriptionUseCase,
  ) {}

  @Roles(RoleContextType.PATIENT)
  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', MEDIA_CONSTANTS.PRESCRIPTION_MAX_FILES, buildMemoryMulterOptions(MEDIA_CONSTANTS.MAX_DOCUMENT_SIZE_BYTES)),
    IdempotencyInterceptor,
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: MEDIA_CONSTANTS.PRESCRIPTION_MAX_FILES },
        notes: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a prescription photo/PDF for pharmacist review (File 10 §2.3 / File 12 Part 37) — multipart, max 5 files, jpeg/png/pdf' })
  upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadPrescriptionDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<UploadPrescriptionResult> {
    const uploadedFiles = toUploadedMediaFiles(files ?? []);
    assertValidMediaFiles(uploadedFiles, {
      allowedMimeTypes: MEDIA_CONSTANTS.DOCUMENT_MIME_TYPES,
      maxFileSizeBytes: MEDIA_CONSTANTS.MAX_DOCUMENT_SIZE_BYTES,
      maxFileCount: MEDIA_CONSTANTS.PRESCRIPTION_MAX_FILES,
    });

    return this.uploadPrescription.execute({ files: uploadedFiles, notes: dto.notes }, user);
  }

  @Roles(RoleContextType.PATIENT, RoleContextType.PHARMACY_STAFF, RoleContextType.ADMIN)
  @Get(':prescriptionId')
  @ApiOperation({ summary: 'Prescription detail — owning patient, pharmacy staff, or Admin' })
  get(@Param('prescriptionId', ParseUUIDPipe) prescriptionId: string, @CurrentUser() user: AccessTokenPayload): Promise<PrescriptionDetail> {
    return this.getPrescription.execute(prescriptionId, user);
  }

  @Roles(RoleContextType.PHARMACY_STAFF)
  @Get()
  @ApiOperation({ summary: 'Pharmacy-staff review queue — QUALITY_CHECK_PASSED prescriptions, oldest-first (File 12 Part 37.5)' })
  list(@Query() query: ListPrescriptionsQueryDto): Promise<ListPrescriptionsResult> {
    return this.listPrescriptions.execute(query);
  }

  @Roles(RoleContextType.PHARMACY_STAFF)
  @Post(':prescriptionId/review')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Pharmacist review decision — accept/reject/needs-clarification, with the controlled-substance hard-block (File 11 05.7)' })
  review(
    @Param('prescriptionId', ParseUUIDPipe) prescriptionId: string,
    @Body() dto: ReviewPrescriptionDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ReviewPrescriptionResult> {
    return this.reviewPrescription.execute(prescriptionId, dto, user);
  }
}
