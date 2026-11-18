import { HoldExpiryJob } from './hold-expiry.job';
import { SlotGenerationJob } from './slot-generation.job';
import { WaitingVisitExpiryJob } from './waiting-visit-expiry.job';

describe('scheduling jobs', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [0, 0],
    [3, 1],
  ])('HoldExpiryJob logs only when holds expired (expired=%i)', async (expired, logs) => {
    const uc = { execute: jest.fn().mockResolvedValue({ expired }) };
    const job = new HoldExpiryJob(uc as any);
    const log = jest.spyOn((job as any).logger, 'log').mockImplementation();
    await job.run();
    expect(uc.execute).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(logs);
  });

  it.each([
    [0, 0],
    [2, 1],
  ])('WaitingVisitExpiryJob logs only when rows updated (updated=%i)', async (updated, logs) => {
    const uc = { execute: jest.fn().mockResolvedValue(updated) };
    const job = new WaitingVisitExpiryJob(uc as any);
    const log = jest.spyOn((job as any).logger, 'log').mockImplementation();
    await job.run();
    expect(uc.execute).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(logs);
  });

  it('SlotGenerationJob always logs the run summary', async () => {
    const uc = { execute: jest.fn().mockResolvedValue({ affiliationsProcessed: 4, slotsCreated: 9 }) };
    const job = new SlotGenerationJob(uc as any);
    const log = jest.spyOn((job as any).logger, 'log').mockImplementation();
    await job.run();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('4 affiliations, 9 slots'));
  });
});
