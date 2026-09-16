import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Laboratory, LabBranch, RoleContextType } from '@prisma/client';
import { CreateLabBranchUseCase } from '../application/create-lab-branch.use-case';
import { CreateLaboratoryUseCase } from '../application/create-laboratory.use-case';
import { GetLaboratoryUseCase } from '../application/get-laboratory.use-case';
import { ListLaboratoriesResult, ListLaboratoriesUseCase } from '../application/list-laboratories.use-case';
import { SuspendLaboratoryUseCase } from '../application/suspend-laboratory.use-case';
import { UpdateLaboratoryUseCase } from '../application/update-laboratory.use-case';
import { VerifyLaboratoryUseCase } from '../application/verify-laboratory.use-case';
import { LaboratoryWithBranches } from '../infrastructure/laboratory.repository';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CreateLabBranchDto } from './dto/create-lab-branch.dto';
import { CreateLaboratoryDto } from './dto/create-laboratory.dto';
import { ListLaboratoriesQueryDto } from './dto/list-laboratories-query.dto';
import { UpdateLaboratoryDto } from './dto/update-laboratory.dto';

/**
 * Admin laboratory directory — the structural mirror of
 * `provider-directory`'s `PharmaciesController`, but owned by this module
 * because `laboratories`/`lab_branches` are `laboratory`-owned tables (File
 * 12 Part 05) and `lab-branches.controller.ts` already lives here.
 *
 * Every route is `@Roles(ADMIN)` at the class level: `RbacGuard` does exact
 * context matching, so this is the whole authorization decision and there is
 * no `/admin` URL prefix (File 12 Part 32.4/07.3). Unlike pharmacies, there
 * is no `@OptionalAuth()` public detail route here — patients discover labs
 * through `GET /lab-branches/search`, never at the laboratory level.
 */
@ApiTags('laboratories')
@ApiBearerAuth()
@Roles(RoleContextType.ADMIN)
@Controller('laboratories')
export class LaboratoriesController {
  constructor(
    @Inject(ListLaboratoriesUseCase) private readonly listLaboratories: ListLaboratoriesUseCase,
    @Inject(CreateLaboratoryUseCase) private readonly createLaboratory: CreateLaboratoryUseCase,
    @Inject(GetLaboratoryUseCase) private readonly getLaboratory: GetLaboratoryUseCase,
    @Inject(UpdateLaboratoryUseCase) private readonly updateLaboratory: UpdateLaboratoryUseCase,
    @Inject(VerifyLaboratoryUseCase) private readonly verifyLaboratory: VerifyLaboratoryUseCase,
    @Inject(SuspendLaboratoryUseCase) private readonly suspendLaboratory: SuspendLaboratoryUseCase,
    @Inject(CreateLabBranchUseCase) private readonly createBranch: CreateLabBranchUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin: review queue — every laboratory regardless of status, optionally filtered, oldest-first' })
  list(@Query() query: ListLaboratoriesQueryDto): Promise<ListLaboratoriesResult> {
    return this.listLaboratories.execute(query);
  }

  @Post()
  @ApiOperation({ summary: 'Admin: onboard a laboratory (status starts PENDING)' })
  create(@Body() dto: CreateLaboratoryDto, @CurrentUser() user: AccessTokenPayload): Promise<Laboratory> {
    return this.createLaboratory.execute(dto, user);
  }

  @Get(':laboratoryId')
  @ApiOperation({ summary: 'Admin: laboratory detail with its branches' })
  get(@Param('laboratoryId', ParseUUIDPipe) laboratoryId: string): Promise<LaboratoryWithBranches> {
    return this.getLaboratory.execute(laboratoryId);
  }

  @Patch(':laboratoryId')
  @ApiOperation({ summary: 'Admin: update laboratory fields' })
  async update(
    @Param('laboratoryId', ParseUUIDPipe) laboratoryId: string,
    @Body() dto: UpdateLaboratoryDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.updateLaboratory.execute(laboratoryId, dto, user);
  }

  @Post(':laboratoryId/verify')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: manual verification — idempotent, emits ProviderVerified' })
  async verify(
    @Param('laboratoryId', ParseUUIDPipe) laboratoryId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.verifyLaboratory.execute(laboratoryId, user);
  }

  @Post(':laboratoryId/suspend')
  @HttpCode(204)
  @ApiOperation({ summary: 'Admin: suspend — idempotent' })
  async suspend(
    @Param('laboratoryId', ParseUUIDPipe) laboratoryId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.suspendLaboratory.execute(laboratoryId, user);
  }

  @Post(':laboratoryId/branches')
  @ApiOperation({ summary: 'Admin: add a physical branch to a laboratory (status starts PENDING)' })
  createLabBranch(
    @Param('laboratoryId', ParseUUIDPipe) laboratoryId: string,
    @Body() dto: CreateLabBranchDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<LabBranch> {
    return this.createBranch.execute(laboratoryId, dto, user);
  }

}
