import { toProvisionedLabStaffResponse, withGeneratedPassword } from './lab-staff-response.util';

describe('lab-staff-response.util', () => {
  const base = { id: 'x' } as any;

  it('withGeneratedPassword returns the same object when no password', () => {
    expect(withGeneratedPassword(base)).toBe(base);
  });

  it('withGeneratedPassword adds the password', () => {
    expect(withGeneratedPassword(base, 'pw')).toEqual({ id: 'x', generated_password: 'pw' });
  });

  it('toProvisionedLabStaffResponse nulls missing title and subtitle', () => {
    const result = toProvisionedLabStaffResponse(
      {
        roleMembershipId: 'rm',
        phone: 'p',
        displayName: 'N',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        generatedPassword: 'pw',
      } as any,
      'b1',
    );
    expect(result).toEqual({
      id: 'rm',
      phone: 'p',
      display_name: 'N',
      title: null,
      subtitle: null,
      lab_branch_id: 'b1',
      status: 'ACTIVE',
      created_at: '2026-01-01T00:00:00.000Z',
      generated_password: 'pw',
    });
  });
});
