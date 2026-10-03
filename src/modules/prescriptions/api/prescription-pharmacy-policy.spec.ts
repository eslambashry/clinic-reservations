import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrescriptionsController } from './prescriptions.controller';
import { PharmacyOrdersController } from '../../pharmacy-fulfillment/api/pharmacy-orders.controller';
import { OrderPrescriptionAccessUseCase } from '../../pharmacy-fulfillment/application/order-prescription-access.use-case';
import { RbacGuard } from '../../../shared/core/auth/rbac.guard';
import { ErrorEnvelopeFilter } from '../../../shared/core/errors/error-envelope.filter';
import { RequestContextService } from '../../../shared/core/context/request-context.service';
import { IdempotencyInterceptor } from '../../../shared/core/idempotency/idempotency-key.interceptor';

/** Real Nest routes/RBAC; identity and application services are fixtures, no database or provider calls. */
describe('PM-SEC-01 HTTP prescription route policy', () => {
  let app: INestApplication;
  const id = 'b7f47702-9a01-4e9c-bbc3-8a80a7e2b162';
  const detail = jest.fn().mockResolvedValue({ prescriptionId: id });
  const get = jest.fn().mockResolvedValue({ prescriptionId: id });
  const review = jest.fn().mockResolvedValue({ status: 'ACCEPTED' });

  beforeAll(async () => {
    const tokens = new Set<any>();
    for (const controller of [PrescriptionsController, PharmacyOrdersController]) {
      for (const dependency of Reflect.getMetadata('self:paramtypes', controller) ?? []) tokens.add(dependency.param);
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [PrescriptionsController, PharmacyOrdersController],
      providers: [...tokens].map((provide) => ({ provide, useValue: provide === OrderPrescriptionAccessUseCase ? { get, review } : { execute: detail } })),
    }).overrideInterceptor(IdempotencyInterceptor).useValue({ intercept: (_ctx: unknown, next: any) => next.handle() }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('v1');
    app.use((req: any, _res: any, next: any) => { req.user = { sub: 'fixture-user', roleMembershipId: 'fixture-membership', contextType: req.headers['x-test-role'], permissions: [] }; next(); });
    app.useGlobalGuards(new RbacGuard(new Reflector()));
    app.useGlobalFilters(new ErrorEnvelopeFilter(new RequestContextService()));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { jest.clearAllMocks(); });

  it('denies global detail to pharmacy staff before its application service runs', async () => {
    const response = await request(app.getHttpServer()).get(`/v1/prescriptions/${id}`).set('x-test-role', 'PHARMACY_STAFF');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ROLE_NOT_PERMITTED');
    expect(detail).not.toHaveBeenCalled();
  });
  it.each(['PATIENT', 'ADMIN'])('preserves global detail route for %s', async (role) => {
    expect((await request(app.getHttpServer()).get(`/v1/prescriptions/${id}`).set('x-test-role', role)).status).toBe(200);
    expect(detail).toHaveBeenCalledTimes(1);
  });
  it('removes the unscoped pharmacy queue and review routes', async () => {
    expect((await request(app.getHttpServer()).get('/v1/prescriptions').set('x-test-role', 'PHARMACY_STAFF')).status).toBe(404);
    expect((await request(app.getHttpServer()).post(`/v1/prescriptions/${id}/review`).set('x-test-role', 'PHARMACY_STAFF').send({ decision: 'ACCEPTED' })).status).toBe(404);
    expect(detail).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });
  it.each(['PATIENT', 'ADMIN', 'DOCTOR', 'CLINIC_STAFF', 'LAB_STAFF'])('denies new order prescription routes to %s', async (role) => {
    expect((await request(app.getHttpServer()).get(`/v1/pharmacy-orders/${id}/prescription`).set('x-test-role', role)).status).toBe(403);
    expect((await request(app.getHttpServer()).post(`/v1/pharmacy-orders/${id}/prescription/review`).set('x-test-role', role).send({ decision: 'ACCEPTED' })).status).toBe(403);
    expect(get).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });
  it('routes pharmacy staff through the order scope service', async () => {
    expect((await request(app.getHttpServer()).get(`/v1/pharmacy-orders/${id}/prescription`).set('x-test-role', 'PHARMACY_STAFF')).status).toBe(200);
    expect((await request(app.getHttpServer()).post(`/v1/pharmacy-orders/${id}/prescription/review`).set('x-test-role', 'PHARMACY_STAFF').send({ decision: 'ACCEPTED' })).status).toBe(201);
    expect(get).toHaveBeenCalledWith(id, expect.objectContaining({ contextType: 'PHARMACY_STAFF' }));
    expect(review).toHaveBeenCalledWith(id, { decision: 'ACCEPTED' }, expect.objectContaining({ contextType: 'PHARMACY_STAFF' }));
  });
});
