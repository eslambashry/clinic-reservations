import { NotificationTier } from '@prisma/client';

/**
 * File 11 Part 19's event -> tier/channel table, made executable. Arabic
 * only (no `locale` column/field exists anywhere in this codebase yet —
 * every other user-facing string in this API is Arabic-only, File 12 Part
 * 12's `error-messages.ar.ts` precedent — so a partial i18n system here
 * would be inventing a capability nothing else in the app has).
 *
 * Deliberately scoped to the events already wired with a `payerUserId`/
 * `patientId` field in their outbox payload (File 12 Part 53) — an event
 * with no entry here is left in its existing "quiet backlog" state
 * (`OutboxWorker`'s documented behavior for "no handler registered yet"),
 * not silently guessed at. Known not-yet-wired: `AppointmentReminder` (no
 * job emits it yet — needs a new time-based cron, a separate feature),
 * `SubstitutionProposed`, `DeliveryStatusChanged`, `PharmacyOrder*`.
 */

export type NotificationChannel = 'PUSH' | 'SMS';

export interface RenderedNotification {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface NotificationTemplate {
  tier: NotificationTier;
  channels: NotificationChannel[];
  /** `undefined` means the payload didn't carry a recipient — the dispatcher treats this as nothing-to-do, not an error (defensive; every wired event below does carry one). */
  extractUserId(payload: Record<string, any>): string | undefined;
  render(payload: Record<string, any>): RenderedNotification;
}

function money(amount: unknown, currency: unknown = 'EGP'): string {
  return `${amount} ${currency}`;
}

export const NOTIFICATION_TEMPLATES: Readonly<Record<string, NotificationTemplate>> = {
  AppointmentConfirmed: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH', 'SMS'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'تم تأكيد الموعد',
      body: 'تم تأكيد موعدك بنجاح. يمكنك مراجعة التفاصيل داخل التطبيق.',
      data: { appointmentId: p.appointmentId },
    }),
  },
  AppointmentCancelled: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH', 'SMS'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'تم إلغاء الموعد',
      body: 'تم إلغاء موعدك. راجع التطبيق لإعادة الحجز إذا رغبت.',
      data: { appointmentId: p.appointmentId },
    }),
  },
  PrescriptionUploaded: {
    tier: 'INFORMATIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'تم استلام الروشتة',
      body: 'تم استلام روشتتك وهي الآن قيد المراجعة.',
      data: { prescriptionId: p.prescriptionId },
    }),
  },
  PrescriptionAccepted: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'تم قبول الروشتة',
      body: 'تم قبول روشتتك من الصيدلي ويمكنك استكمال الطلب الآن.',
      data: { prescriptionId: p.prescriptionId },
    }),
  },
  PrescriptionRejected: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'تم رفض الروشتة',
      body: 'تم رفض روشتتك. راجع التفاصيل داخل التطبيق.',
      data: { prescriptionId: p.prescriptionId },
    }),
  },
  PharmacyOrderAccepted: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'جارٍ مراجعة طلبك',
      body: 'استلمت الصيدلية طلبك وجارٍ تجهيز التسعير الآن.',
      data: { pharmacyOrderId: p.pharmacyOrderId },
    }),
  },
  PharmacyOrderQuoted: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'تم قبول طلبك',
      body: `تم تسعير طلبك بمبلغ ${money(p.totalPrice, p.currency)}. أكمل الدفع لمتابعة التجهيز.`,
      data: { pharmacyOrderId: p.pharmacyOrderId },
    }),
  },
  PharmacyOrderRejected: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'تم رفض طلبك',
      body: 'رفضت الصيدلية طلبك. راجع التفاصيل داخل التطبيق.',
      data: { pharmacyOrderId: p.pharmacyOrderId },
    }),
  },
  PaymentCaptured: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.payerUserId,
    render: (p) => ({
      title: 'تم تأكيد الدفع',
      body: `تم تحصيل دفعتك بمبلغ ${money(p.amount, p.currency)} بنجاح.`,
      data: { paymentIntentId: p.paymentIntentId, payableType: p.payableType, payableId: p.payableId },
    }),
  },
  PaymentFailed: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.payerUserId,
    render: (p) => ({
      title: 'فشلت عملية الدفع',
      body: 'لم تكتمل عملية الدفع. أعد المحاولة قبل انتهاء مهلة الحجز.',
      data: { paymentIntentId: p.paymentIntentId, payableType: p.payableType, payableId: p.payableId },
    }),
  },
  RefundIssued: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.payerUserId,
    render: (p) => ({
      title: 'تم استرداد المبلغ',
      body: `تم استرداد ${p.refundAmount} إلى وسيلة الدفع الأصلية.`,
      data: { paymentIntentId: p.paymentIntentId },
    }),
  },
  PaymentAutoRefunded: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.payerUserId,
    render: (p) => ({
      title: 'تم استرداد دفعتك',
      body: 'وصلت دفعتك بعد انتهاء مهلة الحجز، فتم استرداد المبلغ بالكامل تلقائيًا.',
      data: { paymentIntentId: p.paymentIntentId },
    }),
  },
  WalletToppedUp: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.userId,
    render: (p) => ({
      title: 'تم شحن المحفظة',
      body: `تم شحن محفظتك بمبلغ ${p.amount} EGP. الرصيد الحالي: ${p.newBalance} EGP.`,
      data: { walletId: p.walletId },
    }),
  },
  LabResultReady: {
    tier: 'INFORMATIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'النتيجة جاهزة',
      body: 'نتيجة التحليل جاهزة. يمكنك الاطلاع عليها الآن داخل التطبيق.',
      data: { labOrderId: p.labOrderId },
    }),
  },
  CriticalLabResult: {
    tier: 'SAFETY_CRITICAL',
    channels: ['PUSH', 'SMS'],
    extractUserId: (p) => p.patientId,
    render: (p) => ({
      title: 'نتيجة تحتاج انتباه فوري',
      body: 'توجد نتيجة تحليل تحتاج مراجعة عاجلة. تواصل مع طبيبك في أقرب وقت.',
      data: { labOrderId: p.labOrderId, resultId: p.resultId },
    }),
  },

  // --- Doctor-facing (recipient is the doctor's own User, not the patient) ---
  NewAppointmentBookedForDoctor: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.doctorUserId,
    render: (p) => ({
      title: 'حجز موعد جديد',
      body: 'حجز مريض موعدًا جديدًا معك. راجع التفاصيل داخل التطبيق.',
      data: { appointmentId: p.appointmentId },
    }),
  },
  AppointmentCancelledForDoctor: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.doctorUserId,
    render: (p) => ({
      title: 'تم إلغاء موعد',
      body: 'ألغى أحد المرضى موعده معك.',
      data: { appointmentId: p.appointmentId },
    }),
  },
  AppointmentRescheduledForDoctor: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.doctorUserId,
    render: (p) => ({
      title: 'تم تغيير موعد',
      body: 'غيّر أحد المرضى موعده معك إلى وقت آخر.',
      data: { appointmentId: p.appointmentId },
    }),
  },

  // --- Assistant-facing (recipient is one CLINIC_STAFF assistant at the
  // branch the appointment belongs to — dispatched once per assistant, see
  // the emit call sites for the fan-out). Phrased around the branch/queue,
  // not "معك", since it's their assigned branch's queue, not their own
  // patient relationship. ---
  NewAppointmentBookedForAssistant: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.assistantUserId,
    render: (p) => ({
      title: 'حجز موعد جديد',
      body: 'تم حجز موعد جديد في فرعك. راجع التفاصيل داخل التطبيق.',
      data: { appointmentId: p.appointmentId },
    }),
  },
  AppointmentCancelledForAssistant: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.assistantUserId,
    render: (p) => ({
      title: 'تم إلغاء موعد',
      body: 'تم إلغاء أحد مواعيد فرعك.',
      data: { appointmentId: p.appointmentId },
    }),
  },
  AppointmentRescheduledForAssistant: {
    tier: 'TRANSACTIONAL',
    channels: ['PUSH'],
    extractUserId: (p) => p.assistantUserId,
    render: (p) => ({
      title: 'تم تغيير موعد',
      body: 'تم تغيير موعد أحد مرضى فرعك إلى وقت آخر.',
      data: { appointmentId: p.appointmentId },
    }),
  },
};
