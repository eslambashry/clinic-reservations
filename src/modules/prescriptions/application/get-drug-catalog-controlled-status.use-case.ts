import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DrugCatalogRepository } from '../infrastructure/drug-catalog.repository';

/**
 * File 12 Part 39: `drug_catalog` is owned by `prescriptions` (File 12 Part
 * 05 — no cross-module table reach), so `pharmacy-fulfillment`'s own
 * controlled-substance re-confirmation check (File 10 line 541, distinct
 * from Phase 6's review-time check, Part 37.9) reads it through this
 * export rather than `DrugCatalogRepository` directly.
 */
@Injectable()
export class GetDrugCatalogControlledStatusUseCase {
  constructor(@Inject(DrugCatalogRepository) private readonly drugCatalog: DrugCatalogRepository) {}

  async execute(tx: Prisma.TransactionClient, drugCodes: string[]): Promise<Map<string, boolean>> {
    const drugs = await this.drugCatalog.findManyByCode(tx, [...new Set(drugCodes)]);
    return new Map(drugs.map((drug) => [drug.code, drug.controlled_substance]));
  }
}
