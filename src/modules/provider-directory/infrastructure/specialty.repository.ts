import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Specialty } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';

/**
 * Specialties are static seed data (`db:seed`), not user-editable in MVP
 * (File 10 §3.3) — read-only repository, no create/update here.
 */
@Injectable()
export class SpecialtyRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findAll(): Promise<Specialty[]> {
    return this.prisma.specialty.findMany({ orderBy: { name_en: 'asc' } });
  }

  findByCode(db: Prisma.TransactionClient, code: string): Promise<Specialty | null> {
    return db.specialty.findUnique({ where: { code } });
  }
}
