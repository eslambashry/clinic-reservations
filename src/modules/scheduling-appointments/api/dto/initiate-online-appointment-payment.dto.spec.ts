import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InitiateOnlineAppointmentPaymentDto } from './initiate-online-appointment-payment.dto';

describe('InitiateOnlineAppointmentPaymentDto', () => {
  const billingData = { firstName: 'Sara', lastName: 'Ahmed', email: 'sara@example.com' };

  async function errorsFor(body: Record<string, unknown>) {
    return validate(plainToInstance(InitiateOnlineAppointmentPaymentDto, body), { whitelist: true, forbidNonWhitelisted: true });
  }

  it('accepts a CARD request with phone and billing data', async () => {
    await expect(errorsFor({ method: 'CARD', customer: { phone: '+201012345678' }, billingData })).resolves.toHaveLength(0);
  });

  it.each(['FAWRY', 'MOBILE_WALLET'])('rejects %s (disabled: card is the only online method)', async (method) => {
    const errors = await errorsFor({ method, customer: { phone: '+201012345678' }, billingData });
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'method' })]));
  });

  it('requires Paymob billing data for CARD', async () => {
    const errors = await errorsFor({ method: 'CARD', customer: { phone: '+201012345678' } });
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'billingData' })]));
  });

  it('rejects an empty phone number', async () => {
    const errors = await errorsFor({ method: 'CARD', customer: { phone: '' }, billingData });
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'customer' })]));
  });

  it.each(['paymentAmount', 'walletMobileNumber', 'walletProvider'])('rejects the removed field %s', async (field) => {
    const errors = await errorsFor({ method: 'CARD', customer: { phone: '+201012345678' }, billingData, [field]: '50.00' });
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: field })]));
  });
});
