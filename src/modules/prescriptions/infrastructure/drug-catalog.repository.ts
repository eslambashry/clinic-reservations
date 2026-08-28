import { Injectable } from '@nestjs/common';
import { DrugCatalog, Prisma } from '@prisma/client';

@Injectable()
export class DrugCatalogRepository {
  findManyByCode(db: Prisma.TransactionClient, codes: string[]): Promise<DrugCatalog[]> {
    if (codes.length === 0) {
      return Promise.resolve([]);
    }
    return db.drugCatalog.findMany({ where: { code: { in: codes } } });
  }
}
