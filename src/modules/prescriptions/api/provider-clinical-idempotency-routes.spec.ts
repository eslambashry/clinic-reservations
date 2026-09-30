import { REQUIRE_IDEMPOTENCY_KEY } from '../../../shared/core/idempotency/require-idempotency-key.decorator';
import { LabOrdersController } from '../../laboratory/api/lab-orders.controller';
import { PharmacyOrdersController } from '../../pharmacy-fulfillment/api/pharmacy-orders.controller';
import { PrescriptionsController } from './prescriptions.controller';

describe('provider clinical write idempotency route contract', () => {
  it.each([
    [PrescriptionsController, 'createForProvider'],
    [PrescriptionsController, 'createBatchForProvider'],
    [PrescriptionsController, 'approveForProvider'],
    [PrescriptionsController, 'rejectForProvider'],
    [LabOrdersController, 'createForPatient'],
    [LabOrdersController, 'createBatchForPatients'],
    [PharmacyOrdersController, 'createForProvider'],
  ])('%p.%s requires Idempotency-Key', (controller: any, method: string) => {
    expect(Reflect.getMetadata(REQUIRE_IDEMPOTENCY_KEY, controller.prototype[method])).toBe(true);
  });
});
