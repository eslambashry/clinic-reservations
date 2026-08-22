import { Inject, Injectable } from '@nestjs/common';
import { ScheduleTemplate } from '@prisma/client';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { ScheduleTemplateRepository } from '../infrastructure/schedule-template.repository';

@Injectable()
export class ListScheduleTemplatesUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScheduleTemplateRepository) private readonly scheduleTemplates: ScheduleTemplateRepository,
  ) {}

  execute(affiliationId: string): Promise<ScheduleTemplate[]> {
    return this.scheduleTemplates.findByAffiliationId(this.prisma, affiliationId);
  }
}
