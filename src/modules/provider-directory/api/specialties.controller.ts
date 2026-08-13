import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Specialty } from '@prisma/client';
import { ListSpecialtiesUseCase } from '../application/list-specialties.use-case';
import { Public } from '../../../shared/core/auth/public.decorator';

/** Static seed data (File 10 §3.3) — public, cacheable (File 11 Part 21: `specialties:all`, 24h). */
@ApiTags('specialties')
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly listSpecialties: ListSpecialtiesUseCase) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all specialties' })
  list(): Promise<Specialty[]> {
    return this.listSpecialties.execute();
  }
}
