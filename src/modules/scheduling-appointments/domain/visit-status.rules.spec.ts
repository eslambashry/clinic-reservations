import { isValidVisitStatusTransition, nextVisitStatus } from './visit-status.rules';

describe('visit status progression', () => {
  it('allows only WAITING -> IN_DOCTOR_ROOM -> LEFT', () => {
    expect(nextVisitStatus('WAITING')).toBe('IN_DOCTOR_ROOM');
    expect(nextVisitStatus('IN_DOCTOR_ROOM')).toBe('LEFT');
    expect(nextVisitStatus('LEFT')).toBeNull();
  });

  it.each([
    ['WAITING', 'WAITING'],
    ['WAITING', 'LEFT'],
    ['IN_DOCTOR_ROOM', 'WAITING'],
    ['IN_DOCTOR_ROOM', 'IN_DOCTOR_ROOM'],
    ['LEFT', 'WAITING'],
    ['LEFT', 'IN_DOCTOR_ROOM'],
    ['LEFT', 'LEFT'],
  ] as const)('rejects %s -> %s', (current, target) => {
    expect(isValidVisitStatusTransition(current, target)).toBe(false);
  });
});
