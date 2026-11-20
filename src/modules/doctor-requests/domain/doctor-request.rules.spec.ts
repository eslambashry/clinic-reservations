import { MAX_OPEN_DOCTOR_REQUESTS_PER_PATIENT, canTransition, hasAnyDetail, hasReachedOpenRequestLimit } from './doctor-request.rules';

describe('doctor-request rules', () => {
  describe('hasAnyDetail', () => {
    it('is false when nothing or only blanks are given', () => {
      expect(hasAnyDetail({})).toBe(false);
      expect(hasAnyDetail({ doctorName: '   ', notes: '' })).toBe(false);
      expect(hasAnyDetail({ doctorName: null, clinicName: undefined })).toBe(false);
    });

    it('is true when any single field has content', () => {
      expect(hasAnyDetail({ doctorName: 'Dr Ahmed' })).toBe(true);
      expect(hasAnyDetail({ location: ' Cairo ' })).toBe(true);
      expect(hasAnyDetail({ notes: 'x' })).toBe(true);
    });
  });

  describe('canTransition', () => {
    it('lets open requests move to any other status', () => {
      expect(canTransition('PENDING', 'IN_REVIEW')).toBe(true);
      expect(canTransition('PENDING', 'DOCTOR_ADDED')).toBe(true);
      expect(canTransition('IN_REVIEW', 'REJECTED')).toBe(true);
    });

    it('never moves to the same status', () => {
      expect(canTransition('PENDING', 'PENDING')).toBe(false);
      expect(canTransition('IN_REVIEW', 'IN_REVIEW')).toBe(false);
    });

    it('treats DOCTOR_ADDED and REJECTED as final', () => {
      expect(canTransition('DOCTOR_ADDED', 'PENDING')).toBe(false);
      expect(canTransition('REJECTED', 'IN_REVIEW')).toBe(false);
    });
  });

  describe('hasReachedOpenRequestLimit', () => {
    it('trips exactly at the cap', () => {
      expect(hasReachedOpenRequestLimit(MAX_OPEN_DOCTOR_REQUESTS_PER_PATIENT - 1)).toBe(false);
      expect(hasReachedOpenRequestLimit(MAX_OPEN_DOCTOR_REQUESTS_PER_PATIENT)).toBe(true);
    });
  });
});
