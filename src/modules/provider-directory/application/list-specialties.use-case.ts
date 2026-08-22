import { Inject, Injectable } from '@nestjs/common';
import { Specialty } from '@prisma/client';
import { SpecialtyRepository } from '../infrastructure/specialty.repository';

@Injectable()
export class ListSpecialtiesUseCase {
  constructor(
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
  ) {}

  execute(): Promise<Specialty[]> {
    return this.specialties.findAll();
  }
}
