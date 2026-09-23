import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/core/errors/domain-errors';
import {
  SpecialtyRepository,
  SpecialtyWithCounts,
} from '../infrastructure/specialty.repository';

@Injectable()
export class GetSpecialtyForAdminUseCase {
  constructor(
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
  ) {}

  async execute(code: string): Promise<SpecialtyWithCounts> {
    const specialty = await this.specialties.findByCodeWithCounts(code);
    if (!specialty) throw new NotFoundError('specialty', code);
    return specialty;
  }
}
