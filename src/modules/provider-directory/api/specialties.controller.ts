import {
  Body,
  Controller,
  Delete,
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
import { RoleContextType, Specialty } from '@prisma/client';
import { CreateSpecialtyUseCase } from '../application/create-specialty.use-case';
import { DeleteSpecialtyUseCase } from '../application/delete-specialty.use-case';
import { GetSpecialtyForAdminUseCase } from '../application/get-specialty-for-admin.use-case';
import { ListSpecialtiesForAdminUseCase } from '../application/list-specialties-for-admin.use-case';
import { ListSpecialtiesUseCase } from '../application/list-specialties.use-case';
import { UpdateSpecialtyUseCase } from '../application/update-specialty.use-case';
import { SpecialtyWithCounts } from '../infrastructure/specialty.repository';
import { CurrentUser } from '../../../shared/core/auth/current-user.decorator';
import { AccessTokenPayload } from '../../../shared/core/auth/jwt-payload.interface';
import { Public } from '../../../shared/core/auth/public.decorator';
import { Roles } from '../../../shared/core/auth/roles.decorator';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { ListSpecialtiesQueryDto } from './dto/list-specialties-query.dto';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto';

/**
 * The catalog is public to read (File 11 Part 21: `specialties:all`, 24h)
 * and admin-managed to write.
 */
@ApiTags('specialties')
@Controller('specialties')
export class SpecialtiesController {
  constructor(
    @Inject(ListSpecialtiesUseCase) private readonly listSpecialties: ListSpecialtiesUseCase,
    @Inject(ListSpecialtiesForAdminUseCase)
    private readonly listForAdmin: ListSpecialtiesForAdminUseCase,
    @Inject(GetSpecialtyForAdminUseCase)
    private readonly getForAdmin: GetSpecialtyForAdminUseCase,
    @Inject(CreateSpecialtyUseCase) private readonly createSpecialty: CreateSpecialtyUseCase,
    @Inject(UpdateSpecialtyUseCase) private readonly updateSpecialty: UpdateSpecialtyUseCase,
    @Inject(DeleteSpecialtyUseCase) private readonly deleteSpecialty: DeleteSpecialtyUseCase,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all specialties' })
  list(): Promise<Specialty[]> {
    return this.listSpecialties.execute();
  }

  // Declared before `:code` so "admin" is not captured as a specialty code.
  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Get('admin')
  @ApiOperation({ summary: 'Admin: list specialties with doctor and child counts' })
  listAdmin(@Query() query: ListSpecialtiesQueryDto): Promise<SpecialtyWithCounts[]> {
    return this.listForAdmin.execute(query.q);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Get('admin/:code')
  @ApiOperation({ summary: 'Admin: one specialty with its doctor and child counts' })
  getAdmin(@Param('code', ParseUUIDPipe) code: string): Promise<SpecialtyWithCounts> {
    return this.getForAdmin.execute(code);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Admin: create a specialty' })
  create(
    @Body() dto: CreateSpecialtyDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<Specialty> {
    return this.createSpecialty.execute(dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Patch(':code')
  @ApiOperation({ summary: 'Admin: update a specialty (code itself is immutable)' })
  update(
    @Param('code', ParseUUIDPipe) code: string,
    @Body() dto: UpdateSpecialtyDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<Specialty> {
    return this.updateSpecialty.execute(code, dto, user);
  }

  @ApiBearerAuth()
  @Roles(RoleContextType.ADMIN)
  @Delete(':code')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Admin: delete a specialty — 409 if any doctor or child specialty uses it',
  })
  async remove(
    @Param('code', ParseUUIDPipe) code: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.deleteSpecialty.execute(code, user);
  }
}
