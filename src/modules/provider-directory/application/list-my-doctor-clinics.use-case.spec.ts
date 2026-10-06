import { ListMyDoctorClinicsUseCase } from './list-my-doctor-clinics.use-case';

describe('ListMyDoctorClinicsUseCase', () => {
  const actor = { sub: 'u1' } as any;

  it('maps the doctor scope affiliations to clinic items', async () => {
    const scope = {
      execute: jest.fn().mockResolvedValue({
        affiliations: [
          {
            affiliationId: 'aff1', affiliationStatus: 'ACTIVE', consultFee: '100.00', currency: 'EGP',
            clinicId: 'c1', clinicName: 'Clinic', clinicStatus: 'VERIFIED', clinicBranchId: 'b1', branchStatus: 'VERIFIED',
            branchPhone: '+20', ianaTimezone: 'Africa/Cairo',
            addressLine1: 'l1', addressCity: 'Cairo', addressRegionCode: 'C', addressCountryCode: 'EG',
          },
        ],
      }),
    };
    const res = await new ListMyDoctorClinicsUseCase(scope as any).execute(actor);
    expect(scope.execute).toHaveBeenCalledWith(actor);
    expect(res.items).toEqual([
      {
        affiliationId: 'aff1', affiliationStatus: 'ACTIVE', consultFee: '100.00', currency: 'EGP',
        clinicId: 'c1', clinicName: 'Clinic', clinicStatus: 'VERIFIED', clinicBranchId: 'b1', branchStatus: 'VERIFIED',
        phone: '+20', ianaTimezone: 'Africa/Cairo',
        address: { line1: 'l1', city: 'Cairo', regionCode: 'C', countryCode: 'EG' },
      },
    ]);
  });

  it('returns an empty list when the doctor has no affiliations', async () => {
    const scope = { execute: jest.fn().mockResolvedValue({ affiliations: [] }) };
    await expect(new ListMyDoctorClinicsUseCase(scope as any).execute(actor)).resolves.toEqual({ items: [] });
  });
});
