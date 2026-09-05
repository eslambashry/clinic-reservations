import { LabOrder, LabOrderItem, LabResultDocument } from '@prisma/client';
import { PrescriptionSummary } from '../../prescriptions/application/get-prescription-summary.use-case';
import { UserSummary } from '../../identity-auth/application/get-user-summary.use-case';
import { CustodyEventType } from '../domain/custody-action.util';

export interface CustodyEventDetail {
  id: string;
  orderId: string;
  type: CustodyEventType;
  at: string;
  actorName: string | null;
  note: string | null;
}

export interface NoteDetail {
  id: string;
  at: string;
  author: string;
  body: string;
}

export interface LabOrderItemDetail {
  id: string;
  catalogCode: string;
  displayName: string;
  unitPrice: string | null;
  resultState: string;
  resultId: string | null;
}

export interface LabOrderDetail {
  id: string;
  status: string;
  collectionType: string;
  createdAt: string;
  updatedAt: string;
  branchId: string;
  patient: { id: string; firstName: string | null; lastName: string | null; phoneMasked: string };
  items: LabOrderItemDetail[];
  quote: {
    totalPrice: string;
    currency: string;
    appointmentAt: string;
    prepInstructions: string;
    quotedAt: string;
    quotedBy: string;
  } | null;
  bookingCode: string | null;
  queueNumber: number | null;
  results: {
    id: string;
    orderId: string;
    /** `null` for a freeform order's result (no `LabOrderItem` to attach to) — File 12 Part 50. */
    itemId: string | null;
    fileLabel: string;
    sizeKb: number;
    uploadedAt: string;
    uploadedBy: string;
    isCritical: boolean;
    reviewState: string;
  }[];
  custodyEvents: CustodyEventDetail[];
  /** Sourced from the linked prescription's own images (`PrescriptionSummary.images`) — empty when `prescriptionId` is null (direct catalog selection, no upload). */
  prescriptionImages: { id: string; fileUrl: string }[];
  /** Not persisted anywhere yet — same `not_persisted[]` precedent pharmacy's own `patientNote` follows. */
  patientNote: string | null;
  rejection: { reason: string; note: string | null; at: string } | null;
  recollectionRequired: boolean;
  notes: NoteDetail[];
}

/**
 * Pure mapping only, no I/O — mirrors `buildPharmacyOrderDetail`'s role.
 * Callers (`GetLabOrderUseCase`/`ListLabOrdersUseCase`) already fetched and
 * resolved everything (patient/prescription/items/catalog/results/notes/
 * custody events with actor names) before calling this.
 */
export function buildLabOrderDetail(
  order: LabOrder,
  patient: UserSummary,
  prescription: PrescriptionSummary | null,
  items: LabOrderItem[],
  catalogNameByCode: Map<string, string>,
  results: LabResultDocument[],
  custodyEvents: CustodyEventDetail[],
  notes: NoteDetail[],
): LabOrderDetail {
  return {
    id: order.id,
    status: order.status,
    collectionType: order.collection_type,
    createdAt: order.created_at.toISOString(),
    updatedAt: order.updated_at.toISOString(),
    branchId: order.lab_branch_id,
    patient: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, phoneMasked: patient.phoneMasked },
    items: items.map((item) => ({
      id: item.id,
      catalogCode: item.catalog_code,
      displayName: catalogNameByCode.get(item.catalog_code) ?? item.catalog_code,
      unitPrice: item.unit_price ? item.unit_price.toFixed(2) : null,
      resultState: item.result_state,
      resultId: results.find((r) => r.item_id === item.id)?.id ?? null,
    })),
    quote:
      order.total_price && order.currency && order.appointment_at && order.quoted_at
        ? {
            // `.toFixed(2)` not `.toString()` — same Decimal trailing-zero
            // gap pharmacy's own quote mapper had to fix (File 12 Part 42).
            totalPrice: order.total_price.toFixed(2),
            currency: order.currency,
            appointmentAt: order.appointment_at.toISOString(),
            prepInstructions: order.prep_instructions ?? '',
            quotedAt: order.quoted_at.toISOString(),
            // No `quoted_by` column exists (File 12 Part 47) — the custody
            // trail is already the source of truth for who acted, so the
            // QUOTE_SENT event's own actor is reused rather than adding a
            // redundant denormalized column.
            quotedBy: [...custodyEvents].reverse().find((e) => e.type === 'QUOTE_SENT')?.actorName ?? '',
          }
        : null,
    bookingCode: order.booking_code,
    queueNumber: order.queue_number,
    results: results.map((r) => ({
      id: r.id,
      orderId: r.lab_order_id,
      itemId: r.item_id,
      fileLabel: r.file_label,
      sizeKb: r.size_kb,
      uploadedAt: r.uploaded_at.toISOString(),
      uploadedBy: r.uploaded_by,
      isCritical: r.is_critical,
      reviewState: r.review_state,
    })),
    custodyEvents,
    prescriptionImages: prescription?.images.map((img) => ({ id: img.id, fileUrl: img.fileUrl })) ?? [],
    patientNote: null,
    rejection: order.rejection_reason && order.rejected_at ? { reason: order.rejection_reason, note: order.rejection_note, at: order.rejected_at.toISOString() } : null,
    recollectionRequired: order.recollection_required,
    notes,
  };
}
