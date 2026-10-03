import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../shared/config/configuration';
import { PrismaService } from '../../../shared/kernel/prisma/prisma.service';
import { AppointmentRepository } from '../infrastructure/appointment.repository';

/** Moves only overdue, still-waiting visits to TIME_EXPIRED (and a live
 * booking among them to NO_SHOW, PM-APPT-04). These are database-side
 * conditional updates, so cancellation or a manual check-in that wins the
 * race is never overwritten by the scheduled worker; they run in one
 * transaction so a sweep never half-applies. */
@Injectable()
export class ExpireWaitingVisitsUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppointmentRepository) private readonly appointments: AppointmentRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async execute(): Promise<number> {
    const graceMinutes = this.config.get<AppConfig['scheduling']>('scheduling')?.appointmentEndGraceMinutes ?? 30;
    return this.prisma.$transaction((tx) => this.appointments.expireWaitingVisits(tx, graceMinutes));
  }
}
