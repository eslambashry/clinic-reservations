import { Inject, Injectable } from '@nestjs/common';
import {
  OffsetPageMeta,
  buildPageMeta,
  resolveOffset,
} from '../../../shared/core/pagination/offset.util';
import {
  SpecialtyRepository,
  SpecialtyWithCounts,
} from '../infrastructure/specialty.repository';

export interface ListSpecialtiesForAdminInput {
  q?: string;
  page?: number;
  limit?: number;
}

export interface ListSpecialtiesForAdminResult extends OffsetPageMeta {
  items: SpecialtyWithCounts[];
  /**
   * The whole catalog as `{code, name_ar}`, independent of the page and of
   * `q`. The admin screen resolves a row's parent name and populates the
   * parent picker from this, both of which need specialties the current page
   * does not contain.
   */
  allNames: { code: string; name_ar: string }[];
}

/**
 * The admin table's list. Unlike the public `ListSpecialtiesUseCase` it is
 * paginated, searchable, and carries `doctorCount`/`childCount` — which the
 * dashboard uses to disable the delete action (both block a delete, see
 * `DeleteSpecialtyUseCase`).
 */
@Injectable()
export class ListSpecialtiesForAdminUseCase {
  constructor(
    @Inject(SpecialtyRepository) private readonly specialties: SpecialtyRepository,
  ) {}

  async execute(input: ListSpecialtiesForAdminInput = {}): Promise<ListSpecialtiesForAdminResult> {
    const search = input.q?.trim() || undefined;
    const offset = resolveOffset({ page: input.page, limit: input.limit });

    const [items, totalCount, allNames] = await Promise.all([
      this.specialties.findPageWithCounts({
        search,
        skip: offset.skip,
        take: offset.take,
      }),
      this.specialties.countAll(search),
      this.specialties.findAllNames(),
    ]);

    return {
      items,
      allNames,
      ...buildPageMeta(totalCount, offset.page, offset.limit),
    };
  }
}
