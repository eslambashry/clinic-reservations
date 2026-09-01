import { PharmacyOrder } from '@prisma/client';
import { PrescriptionSummary } from '../../prescriptions/application/get-prescription-summary.use-case';
import { UserSummary } from '../../identity-auth/application/get-user-summary.use-case';

export interface PharmacyOrderDetail {
  id: string;
  status: string;
  fulfillmentType: string;
  createdAt: string;
  updatedAt: string;
  patient: { id: string; firstName: string | null; lastName: string | null; phoneMasked: string };
  prescription: {
    id: string;
    source: string;
    status: string;
    expiresAt: string | null;
    doctorName: string | null;
    images: { id: string; fileUrl: string; qualityCheckStatus: string }[];
  };
  quote: { totalPrice: string; currency: string; estimatedReadyMinutes: number | null; note: string | null; quotedAt: string } | null;
  /** The prescription's own `notes` field (patient-typed at upload time) — surfaced here for convenience so the order detail carries it without a separate prescription fetch. */
  patientNote: string | null;
  staffNote: string | null;
  rejection: { reason: string; note: string | null; at: string } | null;
}

/**
 * 2026-08-29 addition — factored out of `GetPharmacyOrderUseCase` so
 * `ListPharmacyOrdersUseCase` can build the exact same shape per row
 * (`medsuper-pharmacy-dashboard`'s `listOrders`/`getOrder` both return the
 * full `PharmacyOrder` projection, not a lighter list-row variant — matching
 * `MockPharmacyOrdersService`, the target contract). Pure mapping only, no
 * I/O — callers already fetched `patient`/`prescription`/`doctorName`.
 */
export function buildPharmacyOrderDetail(
  order: PharmacyOrder,
  patient: UserSummary,
  prescription: PrescriptionSummary,
  doctorName: string | null,
): PharmacyOrderDetail {
  return {
    id: order.id,
    status: order.status,
    fulfillmentType: order.fulfillment_type,
    createdAt: order.created_at.toISOString(),
    updatedAt: order.updated_at.toISOString(),
    patient: { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, phoneMasked: patient.phoneMasked },
    prescription: {
      id: prescription.id,
      source: prescription.source,
      status: prescription.status,
      expiresAt: prescription.expiresAt,
      doctorName,
      images: prescription.images,
    },
    quote:
      order.total_price && order.currency && order.quoted_at
        ? {
            // `.toFixed(2)`, not `.toString()` (2026-08-29 production-readiness
            // pass, found via real-Postgres integration testing, not unit
            // tests): Prisma's Decimal wraps decimal.js, whose `.toString()`
            // strips trailing zeros — `Decimal('120.00').toString() ===
            // '120'`. The frontend's HTTP adapter trusts this field is
            // already a proper 2-decimal string (it converts string->number
            // itself); a bare "120" would round-trip fine through `Number()`
            // but silently drop the currency's declared precision on the wire.
            totalPrice: order.total_price.toFixed(2),
            currency: order.currency,
            estimatedReadyMinutes: order.estimated_ready_minutes,
            note: order.staff_note,
            quotedAt: order.quoted_at.toISOString(),
          }
        : null,
    patientNote: prescription.notes,
    staffNote: order.staff_note,
    rejection:
      order.rejection_reason && order.rejected_at
        ? { reason: order.rejection_reason, note: order.rejection_note, at: order.rejected_at.toISOString() }
        : null,
  };
}
