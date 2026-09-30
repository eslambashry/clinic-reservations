import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InitiateOnlineAppointmentPaymentDto } from './initiate-online-appointment-payment.dto';

describe('InitiateOnlineAppointmentPaymentDto', () => {
  it('accepts a Fawry request with only the required phone contact', async () => {
    const dto = plainToInstance(InitiateOnlineAppointmentPaymentDto, {
      method: 'FAWRY',
      customer: { phone: '+201012345678' },
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
  });

  it('rejects an empty Fawry phone number', async () => {
    const dto = plainToInstance(InitiateOnlineAppointmentPaymentDto, {
      method: 'FAWRY',
      customer: { phone: '' },
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'customer' })]),
    );
  });

  it('rejects personal billing fields nested under the Fawry customer contact', async () => {
    const dto = plainToInstance(InitiateOnlineAppointmentPaymentDto, {
      method: 'FAWRY',
      customer: {
        phone: '+201012345678',
        firstName: 'Patient',
        lastName: 'Name',
        email: 'patient@example.com',
      },
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'customer' })]),
    );
  });

  it.each(['CARD', 'MOBILE_WALLET'])(
    'requires Paymob billing data for %s',
    async (method) => {
      const dto = plainToInstance(InitiateOnlineAppointmentPaymentDto, {
        method,
        customer: { phone: '+201012345678' },
      });

      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'billingData' }),
        ]),
      );
    },
  );
});
