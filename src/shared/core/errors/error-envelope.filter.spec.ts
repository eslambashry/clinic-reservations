import { BadRequestException, ForbiddenException, HttpException, Logger, ValidationError } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OptimisticLockError } from '../../kernel/prisma/optimistic-lock';
import { ConflictError, NotFoundError } from './domain-errors';
import { ErrorEnvelopeFilter } from './error-envelope.filter';
import { AR_ERROR_MESSAGES } from './error-messages.ar';

describe('ErrorEnvelopeFilter', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  function run(exception: unknown, correlationId?: string) {
    const filter = new ErrorEnvelopeFilter({ correlationId } as any);
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host: any = {
      switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ method: 'GET', path: '/x' }) }),
    };
    filter.catch(exception, host);
    return { status: status.mock.calls[0][0] as number, body: json.mock.calls[0][0] };
  }

  it('maps AppError keeping Arabic throw-site message and details', () => {
    const { status, body } = run(new ConflictError('X_CONFLICT', 'رسالة عربية', { a: 1 }), 'corr');
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toMatchObject({ code: 'X_CONFLICT', message: 'رسالة عربية', details: { a: 1 }, correlationId: 'corr' });
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('defaults details to {} and correlationId to null; NotFoundError is 404', () => {
    const { status, body } = run(new NotFoundError('Doctor', 'd1'));
    expect(status).toBe(404);
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.error.correlationId).toBeNull();
    expect(body.error.details).toEqual({ resourceType: 'Doctor', resourceId: 'd1' });
  });

  it('maps OptimisticLockError to 409', () => {
    const { status, body } = run(new OptimisticLockError('e1', 2));
    expect(status).toBe(409);
    expect(body.error).toMatchObject({ code: 'OPTIMISTIC_LOCK_CONFLICT', details: { entityId: 'e1' }, message: AR_ERROR_MESSAGES.OPTIMISTIC_LOCK_CONFLICT });
  });

  describe('BadRequestException', () => {
    it('uses arFields when present', () => {
      const { status, body } = run(new BadRequestException({ arFields: ['حقل'] }));
      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual({ fields: ['حقل'] });
    });

    it('translates validationErrors when present', () => {
      const ve: ValidationError = { property: 'phone', constraints: { isString: 'phone must be a string' }, children: [] };
      const { body } = run(new BadRequestException({ validationErrors: [ve] }));
      expect(body.error.details.fields).toEqual(['رقم الهاتف يجب أن يكون نصًا.']);
    });

    it('falls back to the generic Arabic line for a plain body', () => {
      const { body } = run(new BadRequestException('plain english'));
      expect(body.error.details.fields).toEqual([AR_ERROR_MESSAGES.VALIDATION_ERROR]);
      const { body: body2 } = run(new BadRequestException({ other: 1 }));
      expect(body2.error.details.fields).toEqual([AR_ERROR_MESSAGES.VALIDATION_ERROR]);
    });
  });

  describe('generic HttpException status mapping', () => {
    it.each([
      [401, 'UNAUTHENTICATED'],
      [403, 'FORBIDDEN'],
      [404, 'RESOURCE_NOT_FOUND'],
      [429, 'RATE_LIMITED'],
      [413, 'FILE_TOO_LARGE'],
      [503, 'GATEWAY_UNAVAILABLE'],
      [502, 'GATEWAY_UNAVAILABLE'],
      [418, 'INTERNAL_ERROR'],
    ])('status %i -> %s', (st, code) => {
      const { status, body } = run(new HttpException('English msg', st));
      expect(status).toBe(st);
      expect(body.error.code).toBe(code);
      expect(body.error.details).toEqual({});
      expect(/[a-zA-Z]{4}/.test(body.error.message) && body.error.message === 'English msg').toBe(false);
    });

    it('works for subclasses like ForbiddenException', () => {
      expect(run(new ForbiddenException()).body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Prisma fallbacks', () => {
    const prismaErr = (code: string) => new Prisma.PrismaClientKnownRequestError('db boom', { code, clientVersion: 'x' });

    it('P2002 -> 409', () => {
      const { status, body } = run(prismaErr('P2002'));
      expect(status).toBe(409);
      expect(body.error.code).toBe('UNIQUE_CONSTRAINT_VIOLATION');
    });

    it('P2003 -> 404', () => {
      const { status, body } = run(prismaErr('P2003'));
      expect(status).toBe(404);
      expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('other Prisma codes -> 500 and logged as error', () => {
      const { status, body } = run(prismaErr('P2025'));
      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(error).toHaveBeenCalled();
    });
  });

  it('unknown Error and non-Error values -> 500 without leaking text', () => {
    const a = run(new Error('secret stack info'));
    expect(a.status).toBe(500);
    expect(a.body.error.message).not.toContain('secret');
    const b = run('just a string');
    expect(b.status).toBe(500);
    expect(b.body.error.code).toBe('INTERNAL_ERROR');
    expect(error).toHaveBeenCalledTimes(2);
  });
});
