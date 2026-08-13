import { Injectable } from '@nestjs/common';
import { Specialty } from '@prisma/client';
import { SpecialtyRepository } from '../infrastructure/specialty.repository';

@Injectable()
export class ListSpecialtiesUseCase {
  constructor(private readonly specialties: SpecialtyRepository) {}

  execute(): Promise<Specialty[]> {
    return this.specialties.findAll();
  }
}
