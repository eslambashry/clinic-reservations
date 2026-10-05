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

  async function errorsFor(body: Record<string, unknown>) {
    return validate(plainToInstance(InitiateOnlineAppointmentPaymentDto, body), { whitelist: true, forbidNonWhitelisted: true });
  }

  it('accepts MOBILE_WALLET with only the phone and a wallet number (no billingData, no walletProvider)', async () => {
    await expect(errorsFor({ method: 'MOBILE_WALLET', customer: { phone: '+201012345678' }, walletMobileNumber: '01012345678' })).resolves.toHaveLength(0);
  });

  it.each(['01012345678', '01112345678', '01212345678', '01512345678', '+201012345678'])('accepts wallet number %s', async (walletMobileNumber) => {
    await expect(errorsFor({ method: 'MOBILE_WALLET', customer: { phone: '+201012345678' }, walletMobileNumber })).resolves.toHaveLength(0);
  });

  it.each([undefined, '', '0101234567', '01312345678', '201012345678', '+20101234567x'])('rejects MOBILE_WALLET with wallet number %p', async (walletMobileNumber) => {
    const errors = await errorsFor({ method: 'MOBILE_WALLET', customer: { phone: '+201012345678' }, walletMobileNumber });
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'walletMobileNumber' })]));
  });

  it('still accepts the deprecated walletProvider and billingData from older app versions', async () => {
    await expect(
      errorsFor({
        method: 'MOBILE_WALLET',
        customer: { phone: '+201012345678' },
        walletMobileNumber: '01012345678',
        walletProvider: 'VODAFONE_CASH',
        billingData: { firstName: 'Sara', lastName: 'Ahmed', email: 'sara@example.com' },
      }),
    ).resolves.toHaveLength(0);
  });

  it.each(['CARD'])(
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
