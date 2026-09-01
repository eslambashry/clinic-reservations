import { Injectable } from '@nestjs/common';
import { Prisma, TestCatalog } from '@prisma/client';

/** Minimal lookup-table reads — mirrors how `prescriptions`' `DrugCatalog` is read (referenced by code, never embedded free text). */
@Injectable()
export class TestCatalogRepository {
  findByCodes(db: Prisma.TransactionClient, codes: string[]): Promise<TestCatalog[]> {
    if (codes.length === 0) {
      return Promise.resolve([]);
    }
    return db.testCatalog.findMany({ where: { code: { in: codes } } });
  }

  findAllCodes(db: Prisma.TransactionClient, codes: string[]): Promise<string[]> {
    return this.findByCodes(db, codes).then((rows) => rows.map((r) => r.code));
  }
}
