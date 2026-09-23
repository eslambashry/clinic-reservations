import { Inject, Injectable } from '@nestjs/common';
import {
  SpecialtyRepository,
  SpecialtyWithCounts,
} from '../infrastructure/specialty.repository';

/**
 * The admin table's list. Unlike the public `ListSpecialtiesUseCase` it
 * carries `doctorCount`/`childCount`, which the dashboard uses to disable
 * the delete action (both block a delete — see `DeleteSpecialtyUseCase`).
 */
@Injectable()
export class ListSpecialtiesForAdminUseCase {
  constructor(
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
  ) {}

  execute(search?: string): Promise<SpecialtyWithCounts[]> {
    return this.specialties.findAllWithCounts(search?.trim() || undefined);
  }
}
