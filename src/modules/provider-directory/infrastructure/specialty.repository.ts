import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Specialty } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';

/**
 * A specialty plus the two counts the admin table needs: they decide whether
 * the row can be deleted at all (both FKs below block a delete), so they are
 * fetched with the list rather than per-row.
 */
export type SpecialtyWithCounts = Specialty & {
  doctorCount: number;
  childCount: number;
};

export interface CreateSpecialtyInput {
  name_ar: string;
  parent_code?: string | null;
}

export interface UpdateSpecialtyInput {
  name_ar?: string;
  /** `null` clears the parent, making the specialty top-level. */
  parent_code?: string | null;
}

/**
 * Specialties started as static seed data (File 10 §3.3) but are now
 * admin-managed, so this repository writes as well as reads.
 *
 * `code` is the primary key (there is no separate `id`): a database-generated
 * UUID that doctors reference by FK, so it is never supplied or updated.
 */
@Injectable()
export class SpecialtyRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findAll(): Promise<Specialty[]> {
    return this.prisma.specialty.findMany({ orderBy: { name_ar: 'asc' } });
  }

  findByCode(db: Prisma.TransactionClient, code: string): Promise<Specialty | null> {
    return db.specialty.findUnique({ where: { code } });
  }

  /**
   * `code` is a UUID, so it supports no substring match — the admin search is
   * over `name_ar`, which is what the console actually types.
   */
  private searchWhere(search?: string): Prisma.SpecialtyWhereInput | undefined {
    return search ? { name_ar: { contains: search, mode: 'insensitive' } } : undefined;
  }

  /** Admin list: one page of specialties, each row carrying its counts. */
  async findPageWithCounts(params: {
    search?: string;
    skip: number;
    take: number;
  }): Promise<SpecialtyWithCounts[]> {
    const rows = await this.prisma.specialty.findMany({
      where: this.searchWhere(params.search),
      orderBy: { name_ar: 'asc' },
      skip: params.skip,
      take: params.take,
      include: { _count: { select: { doctors: true, children: true } } },
    });

    return rows.map(({ _count, ...specialty }) => ({
      ...specialty,
      doctorCount: _count.doctors,
      childCount: _count.children,
    }));
  }

  countAll(search?: string): Promise<number> {
    return this.prisma.specialty.count({ where: this.searchWhere(search) });
  }

  /**
   * Every specialty's code and name, unpaginated.
   *
   * The admin screen needs the whole catalog regardless of which page it is
   * showing: the parent column resolves a parent that may sit on another page,
   * and the form's parent picker lists them all. Two narrow columns over a
   * reference table, so this stays cheap.
   */
  findAllNames(): Promise<{ code: string; name_ar: string }[]> {
    return this.prisma.specialty.findMany({
      orderBy: { name_ar: 'asc' },
      select: { code: true, name_ar: true },
    });
  }

  async findByCodeWithCounts(code: string): Promise<SpecialtyWithCounts | null> {
    const row = await this.prisma.specialty.findUnique({
      where: { code },
      include: { _count: { select: { doctors: true, children: true } } },
    });
    if (!row) return null;

    const { _count, ...specialty } = row;
    return { ...specialty, doctorCount: _count.doctors, childCount: _count.children };
  }

  create(db: Prisma.TransactionClient, input: CreateSpecialtyInput): Promise<Specialty> {
    return db.specialty.create({
      data: {
        name_ar: input.name_ar,
        parent_code: input.parent_code ?? null,
      },
    });
  }

  update(
    db: Prisma.TransactionClient,
    code: string,
    input: UpdateSpecialtyInput,
  ): Promise<Specialty> {
    return db.specialty.update({
      where: { code },
      data: {
        ...(input.name_ar !== undefined && { name_ar: input.name_ar }),
        ...(input.parent_code !== undefined && { parent_code: input.parent_code }),
      },
    });
  }

  async delete(db: Prisma.TransactionClient, code: string): Promise<void> {
    await db.specialty.delete({ where: { code } });
  }

  /**
   * `doctors.specialty_code` is NOT NULL with ON DELETE RESTRICT, so a
   * specialty with doctors cannot be deleted — counted up front to fail with
   * a clear error instead of a raw FK violation.
   */
  countDoctors(db: Prisma.TransactionClient, code: string): Promise<number> {
    return db.doctor.count({ where: { specialty_code: code } });
  }

  /**
   * `specialties.parent_code` is ON DELETE SET NULL, so deleting a parent
   * would silently re-parent its children to top level. Counted so the
   * delete can be refused instead.
   */
  countChildren(db: Prisma.TransactionClient, code: string): Promise<number> {
    return db.specialty.count({ where: { parent_code: code } });
  }

  /** The codes on the path from `code` up to the root, `code` first. */
  async ancestorCodes(db: Prisma.TransactionClient, code: string): Promise<string[]> {
    const chain: string[] = [];
    let current: string | null = code;

    // `parent_code` is FK-constrained to an existing specialty, so the walk
    // terminates; the seen-set is a cheap guard against a cycle created by
    // some future direct-to-database edit.
    while (current && !chain.includes(current)) {
      chain.push(current);
      const row: { parent_code: string | null } | null = await db.specialty.findUnique({
        where: { code: current },
        select: { parent_code: true },
      });
      current = row?.parent_code ?? null;
    }

    return chain;
  }
}
