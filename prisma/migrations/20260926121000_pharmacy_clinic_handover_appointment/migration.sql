ALTER TABLE pharmacy_orders
  ADD COLUMN appointment_id UUID,
  ADD COLUMN handover_clinic_branch_id UUID;

CREATE INDEX pharmacy_orders_appointment_id_idx ON pharmacy_orders(appointment_id);
CREATE INDEX pharmacy_orders_handover_clinic_branch_id_idx ON pharmacy_orders(handover_clinic_branch_id);

ALTER TABLE pharmacy_orders
  ADD CONSTRAINT pharmacy_orders_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE pharmacy_orders
  ADD CONSTRAINT pharmacy_orders_handover_clinic_branch_id_fkey
  FOREIGN KEY (handover_clinic_branch_id) REFERENCES clinic_branches(id) ON DELETE SET NULL ON UPDATE CASCADE;
