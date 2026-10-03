import { FulfillPharmacyOrderUseCase } from './fulfill-pharmacy-order.use-case';

function setup() {
  const tx = {} as any;
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const pharmacyOrders = { findById: jest.fn(), setStatus: jest.fn() };
  const getActiveRoleMembership = { execute: jest.fn() };
  const audit = { record: jest.fn() };
  const outbox = { emit: jest.fn() };
  const listClinicAssistants = { execute: jest.fn().mockResolvedValue([]) };
  const getHandoverAppointment = { execute: jest.fn() };
  const useCase = new FulfillPharmacyOrderUseCase(
    prisma as any,
    pharmacyOrders as any,
    getActiveRoleMembership as any,
    audit as any,
    outbox as any,
    listClinicAssistants as any,
    getHandoverAppointment as any,
  );
  return { tx, pharmacyOrders, getActiveRoleMembership, outbox, listClinicAssistants, getHandoverAppointment, useCase };
}

describe('FulfillPharmacyOrderUseCase', () => {
  const actor = { sub: 'staff-1', roleMembershipId: 'm-2', roleCode: 'PHARMACY_STAFF', contextType: 'PHARMACY_STAFF', permissions: [] } as any;
  const membership = { roleMembershipId: 'm-2', contextId: 'branch-1' };

  it('moves a priced ACCEPTED pickup order to READY_FOR_PICKUP', async () => {
    const { tx, pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'ACCEPTED', pharmacy_branch_id: 'branch-1', fulfillment_type: 'PICKUP' });

    const result = await useCase.execute('order-1', actor);

    expect(pharmacyOrders.setStatus).toHaveBeenCalledWith(tx, 'order-1', 1, 'READY_FOR_PICKUP');
    expect(result).toEqual({ pharmacyOrderId: 'order-1', status: 'READY_FOR_PICKUP' });
  });

  it('moves a priced ACCEPTED delivery order to OUT_FOR_DELIVERY', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'ACCEPTED', pharmacy_branch_id: 'branch-1', fulfillment_type: 'DELIVERY' });

    const result = await useCase.execute('order-1', actor);

    expect(result.status).toBe('OUT_FOR_DELIVERY');
  });

  describe('CLINIC_HANDOVER dispatch', () => {
    const handoverOrder = {
      id: 'order-1', version: 1, status: 'ACCEPTED', pharmacy_branch_id: 'branch-1', fulfillment_type: 'CLINIC_HANDOVER',
      patient_id: 'patient-1', created_by_user_id: 'doctor-user-1', appointment_id: 'appointment-1', handover_clinic_branch_id: 'clinic-branch-1',
    };

    it("notifies only the linked doctor's assistants at the appointment's branch", async () => {
      const { tx, pharmacyOrders, getActiveRoleMembership, outbox, listClinicAssistants, getHandoverAppointment, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue(handoverOrder);
      getHandoverAppointment.execute.mockResolvedValue({ status: 'CONFIRMED', doctorClinicAffiliationId: 'aff-1', clinicBranchId: 'clinic-branch-1', doctorId: 'doctor-1' });
      listClinicAssistants.execute.mockResolvedValue(['assistant-1']);

      await expect(useCase.execute('order-1', actor)).resolves.toMatchObject({ status: 'OUT_FOR_DELIVERY' });

      expect(getHandoverAppointment.execute).toHaveBeenCalledWith(tx, 'appointment-1', 'patient-1');
      expect(listClinicAssistants.execute).toHaveBeenCalledWith(tx, 'clinic-branch-1', 'doctor-1');
      expect(outbox.emit).toHaveBeenCalledWith(tx, 'PharmacyOrderOnWayToClinicForStaff', {
        pharmacyOrderId: 'order-1', appointmentId: 'appointment-1', clinicStaffUserId: 'assistant-1',
      });
      expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderPharmacyOrderStatusChanged', expect.objectContaining({ recipientUserId: 'patient-1', fulfillmentType: 'CLINIC_HANDOVER' }));
      expect(outbox.emit).toHaveBeenCalledWith(tx, 'ProviderPharmacyOrderStatusChanged', expect.objectContaining({ recipientUserId: 'doctor-user-1' }));
    });

    it('does not guess a destination when the appointment moved to another branch or was cancelled', async () => {
      const { pharmacyOrders, getActiveRoleMembership, outbox, listClinicAssistants, getHandoverAppointment, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue(handoverOrder);

      getHandoverAppointment.execute.mockResolvedValueOnce({ status: 'CONFIRMED', doctorClinicAffiliationId: 'aff-2', clinicBranchId: 'clinic-branch-2', doctorId: 'doctor-1' });
      await useCase.execute('order-1', actor);
      getHandoverAppointment.execute.mockResolvedValueOnce({ status: 'CANCELLED', doctorClinicAffiliationId: 'aff-1', clinicBranchId: 'clinic-branch-1', doctorId: 'doctor-1' });
      await useCase.execute('order-1', actor);

      expect(listClinicAssistants.execute).not.toHaveBeenCalled();
      expect(outbox.emit).not.toHaveBeenCalledWith(expect.anything(), 'PharmacyOrderOnWayToClinicForStaff', expect.anything());
    });

    it('still transitions a legacy handover order that has no appointment link, without clinic fan-out', async () => {
      const { pharmacyOrders, getActiveRoleMembership, outbox, getHandoverAppointment, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue({ ...handoverOrder, appointment_id: null, handover_clinic_branch_id: null });

      await expect(useCase.execute('order-1', actor)).resolves.toMatchObject({ status: 'OUT_FOR_DELIVERY' });
      expect(getHandoverAppointment.execute).not.toHaveBeenCalled();
      expect(outbox.emit).not.toHaveBeenCalledWith(expect.anything(), 'PharmacyOrderOnWayToClinicForStaff', expect.anything());
    });

    it('sends one status notice when the patient also created the order', async () => {
      const { pharmacyOrders, getActiveRoleMembership, outbox, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue({ ...handoverOrder, fulfillment_type: 'PICKUP', created_by_user_id: 'patient-1' });

      await useCase.execute('order-1', actor);

      const statusEvents = outbox.emit.mock.calls.filter(([, name]) => name === 'ProviderPharmacyOrderStatusChanged');
      expect(statusEvents).toHaveLength(1);
    });

    it('sends a clinic-creator assistant only the staff handover event, once', async () => {
      const { pharmacyOrders, getActiveRoleMembership, outbox, listClinicAssistants, getHandoverAppointment, useCase } = setup();
      getActiveRoleMembership.execute.mockResolvedValue(membership);
      pharmacyOrders.findById.mockResolvedValue({ ...handoverOrder, created_by_user_id: 'assistant-1' });
      getHandoverAppointment.execute.mockResolvedValue({ status: 'CONFIRMED', clinicBranchId: 'clinic-branch-1', doctorId: 'doctor-1' });
      listClinicAssistants.execute.mockResolvedValue(['assistant-1', 'assistant-2', 'assistant-1']);

      await useCase.execute('order-1', actor);

      const statusEvents = outbox.emit.mock.calls.filter(([, name]) => name === 'ProviderPharmacyOrderStatusChanged');
      const staffEvents = outbox.emit.mock.calls.filter(([, name]) => name === 'PharmacyOrderOnWayToClinicForStaff');
      expect(statusEvents.map(([, , payload]) => payload.recipientUserId)).toEqual(['patient-1']);
      expect(staffEvents.map(([, , payload]) => payload.clinicStaffUserId)).toEqual(['assistant-1', 'assistant-2']);
    });
  });

  it('continues to fulfill legacy PAID rows', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'PAID', pharmacy_branch_id: 'branch-1', fulfillment_type: 'PICKUP' });

    await expect(useCase.execute('order-1', actor)).resolves.toMatchObject({ status: 'READY_FOR_PICKUP' });
  });

  it('422s when the order has not been priced', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'UNDER_REVIEW', pharmacy_branch_id: 'branch-1', fulfillment_type: 'PICKUP' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'PHARMACY_ORDER_NOT_READY_FOR_FULFILLMENT', httpStatus: 422 });
  });

  it('403s when the caller has no active pharmacy branch assignment', async () => {
    const { getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(null);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 403 });
  });

  it("404s when the order was claimed by a different branch (IDOR guard)", async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'ACCEPTED', pharmacy_branch_id: 'some-other-branch', fulfillment_type: 'PICKUP' });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('404s when the order does not exist', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue(null);

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('propagates an optimistic-lock conflict when the order changed between read and write', async () => {
    const { pharmacyOrders, getActiveRoleMembership, useCase } = setup();
    getActiveRoleMembership.execute.mockResolvedValue(membership);
    pharmacyOrders.findById.mockResolvedValue({ id: 'order-1', version: 1, status: 'ACCEPTED', pharmacy_branch_id: 'branch-1', fulfillment_type: 'PICKUP' });
    pharmacyOrders.setStatus.mockRejectedValue({ code: 'OPTIMISTIC_LOCK_CONFLICT', httpStatus: 409 });

    await expect(useCase.execute('order-1', actor)).rejects.toMatchObject({ code: 'OPTIMISTIC_LOCK_CONFLICT', httpStatus: 409 });
  });
});
