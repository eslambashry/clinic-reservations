import { canBypassVisibility, isBranchVisible, isDoctorVisibleViaAffiliation, isProviderEntityVisible } from './provider-visibility.rules';

describe('provider-visibility.rules', () => {
  describe('isProviderEntityVisible', () => {
    it('is visible only when VERIFIED and not soft-deleted', () => {
      expect(isProviderEntityVisible({ status: 'VERIFIED', deletedAt: null })).toBe(true);
      expect(isProviderEntityVisible({ status: 'PENDING', deletedAt: null })).toBe(false);
      expect(isProviderEntityVisible({ status: 'SUSPENDED', deletedAt: null })).toBe(false);
      expect(isProviderEntityVisible({ status: 'VERIFIED', deletedAt: new Date() })).toBe(false);
    });
  });

  describe('isBranchVisible', () => {
    it('is visible only when VERIFIED (no document requirement, Part 32.2)', () => {
      expect(isBranchVisible({ status: 'VERIFIED' })).toBe(true);
      expect(isBranchVisible({ status: 'PENDING' })).toBe(false);
      expect(isBranchVisible({ status: 'SUSPENDED' })).toBe(false);
    });
  });

  describe('isDoctorVisibleViaAffiliation', () => {
    const verifiedDoctor = { status: 'VERIFIED' as const, deletedAt: null };
    const activeAffiliation = { status: 'ACTIVE' as const };
    const verifiedBranch = { status: 'VERIFIED' as const };
    const verifiedClinic = { status: 'VERIFIED' as const, deletedAt: null };

    it('is visible only when the full chain holds', () => {
      expect(
        isDoctorVisibleViaAffiliation({
          doctor: verifiedDoctor,
          affiliation: activeAffiliation,
          branch: verifiedBranch,
          clinic: verifiedClinic,
        }),
      ).toBe(true);
    });

    it('is invisible if the doctor is not VERIFIED', () => {
      expect(
        isDoctorVisibleViaAffiliation({
          doctor: { status: 'PENDING', deletedAt: null },
          affiliation: activeAffiliation,
          branch: verifiedBranch,
          clinic: verifiedClinic,
        }),
      ).toBe(false);
    });

    it('is invisible if the affiliation is PAUSED', () => {
      expect(
        isDoctorVisibleViaAffiliation({
          doctor: verifiedDoctor,
          affiliation: { status: 'PAUSED' },
          branch: verifiedBranch,
          clinic: verifiedClinic,
        }),
      ).toBe(false);
    });

    it('is invisible if the branch is SUSPENDED even though the doctor is VERIFIED', () => {
      expect(
        isDoctorVisibleViaAffiliation({
          doctor: verifiedDoctor,
          affiliation: activeAffiliation,
          branch: { status: 'SUSPENDED' },
          clinic: verifiedClinic,
        }),
      ).toBe(false);
    });

    it('is invisible if the parent clinic is not VERIFIED', () => {
      expect(
        isDoctorVisibleViaAffiliation({
          doctor: verifiedDoctor,
          affiliation: activeAffiliation,
          branch: verifiedBranch,
          clinic: { status: 'PENDING', deletedAt: null },
        }),
      ).toBe(false);
    });
  });

  describe('canBypassVisibility', () => {
    it('is true only for ADMIN', () => {
      expect(canBypassVisibility('ADMIN')).toBe(true);
      expect(canBypassVisibility('PATIENT')).toBe(false);
      expect(canBypassVisibility(undefined)).toBe(false);
    });
  });
});
