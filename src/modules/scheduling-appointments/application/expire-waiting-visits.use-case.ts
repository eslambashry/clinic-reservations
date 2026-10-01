import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../shared/config/configuration';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';

/** Moves only overdue, still-waiting visits to TIME_EXPIRED. This is a
 * database-side conditional update, so cancellation or a manual check-in
 * that wins the race is never overwritten by the scheduled worker. */
@Injectable()
export class ExpireWaitingVisitsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async execute(): Promise<number> {
    const graceMinutes = this.config.get<AppConfig['scheduling']>('scheduling')?.appointmentEndGraceMinutes ?? 30;
    return this.appointments.expireWaitingVisits(this.prisma, graceMinutes);
  }
}
