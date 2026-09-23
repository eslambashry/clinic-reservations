import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { TestCatalogRepository } from '../infrastructure/test-catalog.repository';

@Injectable()
export class ListTestCatalogUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TestCatalogRepository) private readonly catalog: TestCatalogRepository,
  ) {}

  async execute(search?: string): Promise<{ items: { code: string; displayName: string }[] }> {
    const normalized = search?.trim();
    const rows = await this.catalog.list(this.prisma, normalized || undefined);
    return { items: rows.map(({ code, display_name }) => ({ code, displayName: display_name })) };
  }
}
