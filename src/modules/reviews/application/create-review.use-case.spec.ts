import { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/core/errors/domain-errors';
import { CreateReviewUseCase } from './create-review.use-case';

describe('CreateReviewUseCase', () => {
  const actor = { sub: 'patient-1', roleMembershipId: 'm-1', roleCode: 'PATIENT', contextType: 'PATIENT', permissions: [] } as any;
  const tx = {};
  const appointment = { appointmentId: 'appt-1', patientId: 'patient-1', status: 'COMPLETED', doctorId: 'doctor-1' };
  const created = { id: 'review-1', appointment_id: 'appt-1', rating: 5, comment: 'great', created_at: new Date('2026-11-16T10:00:00Z') };

  function setup() {
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const reviews = {
      findByAppointmentId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(created),
      countsByRating: jest.fn().mockResolvedValue({ 5: 1 }),
    };
    const appointments = { execute: jest.fn().mockResolvedValue(appointment) };
    const recompute = {
      execute: jest.fn(async (_tx: any, _id: string, aggregate: () => Promise<unknown>) => {
        await aggregate();
        return { doctorUserId: 'doctor-user-1' };
      }),
    };
    const outbox = { emit: jest.fn() };
    const useCase = new CreateReviewUseCase(prisma as any, reviews as any, appointments as any, recompute as any, outbox as any);
    return { prisma, reviews, appointments, recompute, outbox, useCase };
  }

  it('creates the review, refreshes the doctor aggregate and emits DoctorReviewed', async () => {
    const { reviews, recompute, outbox, useCase } = setup();

    const result = await useCase.execute({ appointmentId: 'appt-1', rating: 5, comment: '  great ' }, actor);

    expect(reviews.create).toHaveBeenCalledWith(tx, expect.objectContaining({ doctorId: 'doctor-1', rating: 5, comment: 'great' }));
    expect(recompute.execute).toHaveBeenCalledWith(tx, 'doctor-1', expect.any(Function));
    expect(outbox.emit).toHaveBeenCalledWith(tx, 'DoctorReviewed', expect.objectContaining({ doctorUserId: 'doctor-user-1', rating: 5 }));
    expect(result).toEqual({ id: 'review-1', appointmentId: 'appt-1', rating: 5, comment: 'great', createdAt: '2026-11-16T10:00:00.000Z' });
  });

  it('stores an empty comment as null', async () => {
    const { reviews, useCase } = setup();
    await useCase.execute({ appointmentId: 'appt-1', rating: 4, comment: '   ' }, actor);
    expect(reviews.create).toHaveBeenCalledWith(tx, expect.objectContaining({ comment: null }));
  });

  it('rejects an appointment that is not COMPLETED', async () => {
    const { appointments, reviews, useCase } = setup();
    appointments.execute.mockResolvedValue({ ...appointment, status: 'CONFIRMED' });

    await expect(useCase.execute({ appointmentId: 'appt-1', rating: 5 }, actor)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(reviews.create).not.toHaveBeenCalled();
  });

  it("404s on someone else's appointment", async () => {
    const { appointments, useCase } = setup();
    appointments.execute.mockRejectedValue(new NotFoundError('Appointment', 'appt-1'));

    await expect(useCase.execute({ appointmentId: 'appt-1', rating: 5 }, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('409s when the appointment is already reviewed', async () => {
    const { reviews, outbox, useCase } = setup();
    reviews.findByAppointmentId.mockResolvedValue(created);

    await expect(useCase.execute({ appointmentId: 'appt-1', rating: 5 }, actor)).rejects.toBeInstanceOf(ConflictError);
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it('maps a unique-index race (P2002) to the same 409', async () => {
    const { reviews, useCase } = setup();
    reviews.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));

    await expect(useCase.execute({ appointmentId: 'appt-1', rating: 5 }, actor)).rejects.toBeInstanceOf(ConflictError);
  });
});
