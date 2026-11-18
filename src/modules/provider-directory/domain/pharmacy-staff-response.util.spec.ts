import { toPharmacyStaffResponse, toProvisionedPharmacyStaffResponse } from './pharmacy-staff-response.util';

describe('pharmacy-staff-response.util', () => {
  const createdAt = new Date('2026-01-02T03:04:05.000Z');

  it('maps a staff member', () => {
    expect(
      toPharmacyStaffResponse(
        { roleMembershipId: 'rm1', phone: '+20', displayName: 'Sara', title: 'T', subtitle: 'S', status: 'ACTIVE', createdAt } as any,
        'b1',
      ),
    ).toEqual({
      id: 'rm1', phone: '+20', display_name: 'Sara', title: 'T', subtitle: 'S',
      pharmacy_branch_id: 'b1', status: 'ACTIVE', created_at: createdAt.toISOString(),
    });
  });

  it('defaults a missing display name to empty string and allows null branch', () => {
    const res = toPharmacyStaffResponse(
      { roleMembershipId: 'rm1', phone: '+20', displayName: null, title: null, subtitle: null, status: 'SUSPENDED', createdAt } as any,
      null,
    );
    expect(res.display_name).toBe('');
    expect(res.pharmacy_branch_id).toBeNull();
    expect(res.status).toBe('SUSPENDED');
  });

  it('maps a provisioned account including the generated password', () => {
    const res = toProvisionedPharmacyStaffResponse(
      { roleMembershipId: 'rm1', phone: '+20', displayName: 'Sara', title: 'T', subtitle: 'S', status: 'ACTIVE', createdAt, generatedPassword: 'pw' } as any,
      'b1',
    );
    expect(res).toMatchObject({ id: 'rm1', title: 'T', subtitle: 'S', pharmacy_branch_id: 'b1', generated_password: 'pw' });
  });

  it('nulls undefined title/subtitle on provisioned accounts', () => {
    const res = toProvisionedPharmacyStaffResponse(
      { roleMembershipId: 'rm1', phone: '+20', displayName: 'Sara', status: 'ACTIVE', createdAt, generatedPassword: 'pw' } as any,
      'b1',
    );
    expect(res.title).toBeNull();
    expect(res.subtitle).toBeNull();
  });
});
