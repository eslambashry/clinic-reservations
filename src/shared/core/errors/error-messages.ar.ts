/**
 * Arabic-only user-facing error copy — the single source of truth for every
 * `message` string that leaves this API.
 *
 * MedSuper is Egypt-first and Arabic-first: patients, doctors, pharmacists
 * and lab technicians all read the same envelope, so an English `message`
 * reaching any of them is a product bug, not a cosmetic one. Two rules keep
 * that guarantee airtight:
 *
 *  1. Every `AppError` throw site writes its message in Arabic. The specific
 *     sentence at the throw site is the *best* copy, because it knows which
 *     of several situations under one code actually happened.
 *  2. `ErrorEnvelopeFilter` treats this catalog as the safety net: any
 *     message that is not Arabic (a Nest/Prisma/library error, or a throw
 *     site added later without translation) is replaced by
 *     `AR_ERROR_MESSAGES` for that code before serialization. The English
 *     text still reaches the server log, where developers — not patients —
 *     read it.
 *
 * Copy conventions, applied consistently below:
 *  - Modern Standard Arabic, readable to an Egyptian user; no transliterated
 *    English, no error codes, no internal identifiers, no doc references.
 *  - Say what happened, then what the reader can do about it.
 *  - Never blame the reader, never expose infrastructure detail.
 */

/** Shown when a code has no entry and the thrown message was not Arabic. */
export const AR_FALLBACK_MESSAGE =
  'حدث خطأ غير متوقع. أعد المحاولة، وإن استمرت المشكلة تواصل مع الدعم.';

/**
 * `code` → Arabic message. Keyed by the exact `code` string that appears in
 * the error envelope, so a client that switches on `code` and a client that
 * displays `message` always agree.
 */
export const AR_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  // ── Authentication (401) ────────────────────────────────────────────────
  UNAUTHENTICATED: 'يلزم تسجيل الدخول لإتمام هذا الإجراء.',
  TOKEN_EXPIRED: 'انتهت صلاحية جلستك. سجّل الدخول مرة أخرى للمتابعة.',
  INVALID_REFRESH_TOKEN: 'لم تعد جلستك صالحة. سجّل الدخول مرة أخرى.',
  TOKEN_FAMILY_REVOKED: 'تم إنهاء هذه الجلسة لأسباب أمنية. سجّل الدخول مرة أخرى.',

  // ── Authorization (403) ─────────────────────────────────────────────────
  FORBIDDEN: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
  ROLE_NOT_PERMITTED: 'صلاحيات حسابك لا تسمح بهذا الإجراء.',
  RESOURCE_NOT_OWNED: 'هذا العنصر غير مرتبط بحسابك.',

  // ── OTP / rate limiting ─────────────────────────────────────────────────
  INVALID_CODE: 'رمز التحقق غير صحيح. راجع الرمز وأعد المحاولة.',
  CODE_EXPIRED: 'انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا.',
  TOO_MANY_ATTEMPTS: 'تجاوزت عدد المحاولات المسموح بها. اطلب رمزًا جديدًا.',
  RATE_LIMITED: 'عدد المحاولات كبير خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.',

  // ── Accounts & staff provisioning ───────────────────────────────────────
  PHONE_ALREADY_REGISTERED: 'رقم الهاتف مسجَّل بالفعل في حساب آخر.',
  STAFF_ALREADY_PROVISIONED: 'رقم الهاتف مُضاف بالفعل إلى فريق هذه الجهة.',
  STAFF_ASSIGNED_ELSEWHERE: 'رقم الهاتف مرتبط بفريق جهة أخرى.',

  // ── Generic envelope codes ──────────────────────────────────────────────
  VALIDATION_ERROR: 'البيانات المُرسَلة غير صحيحة. راجع الحقول ثم أعد المحاولة.',
  RESOURCE_NOT_FOUND: 'العنصر المطلوب غير موجود.',
  UNIQUE_CONSTRAINT_VIOLATION: 'هذا الإجراء يتعارض مع سجل موجود بالفعل.',
  OPTIMISTIC_LOCK_CONFLICT: 'تم تعديل هذا السجل من جهة أخرى. حدِّث الصفحة ثم أعد المحاولة.',
  IDEMPOTENCY_KEY_REUSE: 'هناك طلب مطابق قيد التنفيذ بالفعل. انتظر حتى ينتهي قبل إعادة المحاولة.',
  GATEWAY_UNAVAILABLE: 'الخدمة غير متاحة مؤقتًا. أعد المحاولة بعد قليل.',
  INTERNAL_ERROR: 'حدث خطأ غير متوقع. أعد المحاولة، وإن استمرت المشكلة تواصل مع الدعم.',

  // ── File upload ─────────────────────────────────────────────────────────
  FILE_REQUIRED: 'يلزم إرفاق ملف واحد على الأقل.',
  TOO_MANY_FILES: 'عدد الملفات المرفقة أكبر من الحد المسموح به.',
  UNSUPPORTED_FILE_TYPE: 'نوع الملف غير مدعوم. أرفق صورة أو ملف PDF.',
  FILE_TOO_LARGE: 'حجم الملف أكبر من الحد المسموح به. أرفق ملفًا أصغر.',
  EMPTY_FILE: 'الملف المرفوع فارغ. تأكد من الملف وأعد رفعه.',
  INVALID_PHOTO_DATA_URI: 'صيغة الصورة المُرسَلة غير صحيحة. أعد رفع الصورة.',

  // ── Scheduling & appointments ───────────────────────────────────────────
  SLOT_ALREADY_BOOKED: 'لم يعد هذا الموعد متاحًا. اختر موعدًا آخر.',
  SLOT_ALREADY_HELD: 'هذا الموعد محجوز مؤقتًا لمريض آخر. اختر موعدًا آخر.',
  HOLD_EXPIRED: 'انتهت مهلة الحجز المؤقت أو تم استخدامه. ابدأ حجزًا جديدًا.',
  HOLD_STATE_CHANGED: 'تم تعديل الحجز المؤقت من جهة أخرى. حدِّث الصفحة ثم أعد المحاولة.',
  APPOINTMENT_NOT_CANCELLABLE: 'لا يمكن إلغاء هذا الموعد إلا وهو مؤكَّد.',
  APPOINTMENT_NOT_RESCHEDULABLE: 'لا يمكن تغيير هذا الموعد إلا وهو مؤكَّد.',
  APPOINTMENT_STATE_CHANGED: 'تم تعديل هذا الموعد من جهة أخرى. حدِّث الصفحة ثم أعد المحاولة.',
  INVALID_SCHEDULE_WINDOW: 'وقت النهاية يجب أن يكون بعد وقت البداية.',
  SCHEDULE_WINDOW_OVERLAP: 'يوجد بالفعل فترة عمل في هذا اليوم تتداخل مع الوقت المحدد.',
  INVALID_DATE_RANGE: 'النطاق الزمني المطلوب غير صحيح.',
  CANCELLATION_REASON_NOT_PERMITTED: 'سبب الإلغاء غير مسموح به في هذا الإجراء.',
  CANCELLATION_TIER_NOT_CONFIGURED: 'سياسة الإلغاء غير مُهيَّأة لهذه المنطقة. تواصل مع الدعم.',
  COMMISSION_RATE_NOT_CONFIGURED: 'نسبة العمولة غير مُهيَّأة لهذه المنطقة. تواصل مع الدعم.',

  // ── Provider directory ──────────────────────────────────────────────────
  DOCTOR_ALREADY_EXISTS: 'هذا الحساب لديه ملف طبيب بالفعل.',
  AFFILIATION_ALREADY_EXISTS: 'هذا الطبيب مرتبط بهذا الفرع بالفعل.',
  BRANCH_HAS_BOOKINGS: 'لا يمكن حذف الفرع لأنه يحتوي على مواعيد محجوزة.',
  PROVIDER_TYPE_NOT_SUPPORTED: 'هذا النوع من مقدّمي الخدمة غير مدعوم في هذا الإجراء.',

  // ── Payments ────────────────────────────────────────────────────────────
  PAYMENT_METHOD_NOT_SUPPORTED: 'وسيلة الدفع هذه غير متاحة حاليًا. الدفع في العيادة هو الخيار المتاح.',
  PAYMENT_INTENT_NOT_REFUNDABLE: 'لا يمكن استرداد مبلغ لم يتم تحصيله.',
  PAYMENT_INTENT_STATE_CHANGED: 'تم تعديل عملية الدفع من جهة أخرى. حدِّث الصفحة ثم أعد المحاولة.',
  PAYMENT_CAPTURE_FAILED: 'تعذّر تحصيل الدفعة. أعد المحاولة.',

  // ── Prescriptions ───────────────────────────────────────────────────────
  PRESCRIPTION_NOT_ACCEPTED: 'لم تجتَز الروشتة فحص الجودة أو مراجعة الصيدلي بعد.',
  CONTROLLED_SUBSTANCE_CONFIRMATION_REQUIRED:
    'تحتوي الروشتة على دواء خاضع للرقابة. يلزم تأكيد صريح من الصيدلي قبل المتابعة.',

  // ── Pharmacy fulfillment ────────────────────────────────────────────────
  PHARMACY_ORDER_ALREADY_EXISTS: 'يوجد طلب صيدلية نشِط لهذه الروشتة بالفعل.',
  NO_FULFILLABLE_ITEMS: 'لا توجد أصناف قابلة للصرف في هذه الروشتة.',
  NO_PHARMACY_BRANCHES_AVAILABLE: 'لا توجد فروع صيدليات موثَّقة قريبة من الموقع المحدَّد.',
  PHARMACY_ORDER_LOCATION_REQUIRED: 'حدِّد موقعك أو اختر فرع صيدلية لإتمام الطلب.',
  PHARMACY_BRANCH_NOT_DELIVERY_CAPABLE: 'فرع الصيدلية المختار لا يوفّر خدمة التوصيل.',
  ORDER_ALREADY_CLAIMED: 'استلم فرع صيدلية آخر هذا الطلب قبلك.',
  BROADCAST_ALREADY_RESPONDED: 'سبق لهذا الفرع الرد على هذا الطلب.',
  PHARMACY_ORDER_NOT_UNDER_REVIEW: 'هذا الطلب ليس في انتظار تسعير.',
  PHARMACY_ORDER_NOT_APPROVABLE: 'هذا الطلب ليس في انتظار موافقة.',
  PHARMACY_ORDER_NOT_REJECTABLE: 'هذا الطلب ليس في انتظار قرار.',
  PHARMACY_ORDER_NOT_SUBSTITUTION_PROPOSED: 'لا يوجد بديل مقترح في هذا الطلب لرفضه.',
  PHARMACY_ORDER_NOT_PAID: 'لم يتم دفع هذا الطلب بعد.',
  PHARMACY_ORDER_NOT_READY_TO_COMPLETE: 'هذا الطلب غير جاهز ليُسجَّل كمكتمل.',
  PHARMACY_ORDER_STATUS_CHANGED: 'تغيّرت حالة هذا الطلب من جهة أخرى. حدِّث الصفحة ثم أعد المحاولة.',
  REJECTION_REASON_REQUIRED: 'اكتب سبب الرفض قبل المتابعة.',
  INVALID_TOTAL_PRICE: 'الإجمالي يجب أن يكون أكبر من صفر.',
  INVALID_ESTIMATED_READY_MINUTES: 'مدة التجهيز المتوقّعة خارج النطاق المسموح به.',

  // ── Laboratory ──────────────────────────────────────────────────────────
  LAB_ORDER_NEEDS_TESTS_OR_PRESCRIPTION: 'اختر تحليلًا واحدًا على الأقل أو أرفق روشتة.',
  LAB_BRANCH_NOT_HOME_COLLECTION_CAPABLE: 'فرع المعمل المختار لا يوفّر سحب العيّنة من المنزل.',
  UNKNOWN_TEST_CODE: 'يوجد تحليل غير معروف ضمن الطلب. راجع التحاليل المختارة.',
  LAB_ORDER_ITEM_ID_REQUIRED: 'هذا الطلب يحتوي على تحاليل مسجّلة — حدّد التحليل المطلوب تسجيل نتيجته.',
  LAB_ORDER_NOT_REQUESTED: 'التسعير متاح فقط لطلب في انتظار عرض سعر.',
  LAB_ORDER_NOT_QUOTED: 'تأكيد الحجز يتطلّب عرض سعر مُرسَلًا في انتظار رد المريض.',
  LAB_ORDER_NOT_AWAITING_SAMPLE: 'هذه الخطوة تتطلّب حجزًا مؤكَّدًا في انتظار العيّنة.',
  LAB_ORDER_NOT_RESCHEDULABLE: 'لا يمكن تغيير الموعد إلا قبل سحب العيّنة.',
  LAB_ORDER_NO_QUOTE_TO_RESCHEDULE: 'لا يوجد موعد مُسعَّر في هذا الطلب لتغييره.',
  LAB_ORDER_SAMPLE_ALREADY_LIVE: 'توجد عيّنة مسحوبة بالفعل مرتبطة بهذا الطلب.',
  LAB_ORDER_SAMPLE_ALREADY_COLLECTED: 'تم سحب عيّنة لهذا الطلب بالفعل.',
  LAB_ORDER_NO_LIVE_SAMPLE: 'لا توجد عيّنة صالحة مرتبطة بهذا الطلب.',
  LAB_ORDER_COLLECTION_GATE_NOT_SATISFIED: 'سجِّل وصول المريض أو أرسل المندوب قبل سحب العيّنة.',
  LAB_ORDER_NOT_HOME_COLLECTION: 'هذا طلب زيارة للفرع؛ سجِّل وصول المريض بدلًا من إرسال مندوب.',
  LAB_ORDER_NOT_VISIT: 'هذا طلب سحب منزلي؛ أرسل مندوبًا بدلًا من تسجيل الوصول.',
  LAB_ORDER_ARRIVAL_ALREADY_RECORDED: 'تم تسجيل وصول المريض لهذا الطلب بالفعل.',
  LAB_ORDER_RECOLLECTION_NOT_REQUIRED: 'إعادة السحب متاحة فقط بعد رفض عيّنة.',
  LAB_ORDER_NOT_IN_ANALYSIS: 'لا يمكن تسجيل النتائج إلا أثناء التحليل أو بعده.',
  LAB_ORDER_ITEM_RESULT_ALREADY_RECORDED: 'تم تسجيل نتيجة لهذا التحليل بالفعل.',
  LAB_RESULT_ALREADY_REVIEWED: 'تم تحديد ما إذا كانت هذه النتيجة حرجة بالفعل.',
  LAB_ORDER_RESULTS_PENDING_REVIEW: 'حدِّد الحالة الحرجة لكل نتيجة قبل توثيق التسليم.',
  LAB_ORDER_RESULTS_NOT_READY: 'النتائج غير جاهزة للتسليم بعد.',
  LAB_ORDER_NOT_REJECTABLE: 'انتهت المهلة التي يمكن فيها رفض هذا الطلب.',
};

/**
 * `NotFoundError`'s `resourceType` → the Arabic noun used in "… غير موجود".
 * An unmapped type falls back to a neutral noun rather than leaking the
 * English class name into a patient-facing message.
 */
export const AR_RESOURCE_NAMES: Readonly<Record<string, string>> = {
  Appointment: 'الموعد',
  AppointmentHold: 'الحجز المؤقت',
  AppointmentSlot: 'الموعد المتاح',
  Assistant: 'المساعد',
  Clinic: 'العيادة',
  ClinicBranch: 'فرع العيادة',
  Doctor: 'الطبيب',
  DoctorClinicAffiliation: 'ارتباط الطبيب بالفرع',
  DoctorRegistration: 'طلب تسجيل الطبيب',
  LabBranch: 'فرع المعمل',
  LabOrder: 'طلب التحاليل',
  LabOrderItem: 'التحليل المطلوب',
  LabResultDocument: 'ملف نتيجة التحليل',
  PaymentIntent: 'عملية الدفع',
  Pharmacy: 'الصيدلية',
  PharmacyBranch: 'فرع الصيدلية',
  PharmacyOrder: 'طلب الصيدلية',
  PharmacyOrderBroadcast: 'إشعار طلب الصيدلية',
  Prescription: 'الروشتة',
  PrescriptionItem: 'الصنف داخل الروشتة',
  ProviderVerificationDocument: 'مستند التوثيق',
  ScheduleTemplate: 'قالب المواعيد',
  Specialty: 'التخصص',
  User: 'المستخدم',
};

/** "الموعد غير موجود." — the one sentence every 404 uses. */
export function arNotFoundMessage(resourceType: string): string {
  return `${AR_RESOURCE_NAMES[resourceType] ?? 'العنصر المطلوب'} غير موجود.`;
}

/**
 * Arabic script detection. Deliberately broad (Arabic + Arabic Supplement +
 * Extended-A + presentation forms) so a message written with any Arabic
 * letter counts as translated.
 */
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** True when `text` contains Arabic — the filter's "already translated" test. */
export function containsArabic(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

/**
 * The one function that decides what a client actually reads. An Arabic
 * `message` from the throw site wins (it is the most specific copy);
 * anything else is replaced by this catalog, then by the generic fallback.
 */
export function arErrorMessage(code: string, message?: string): string {
  if (message && containsArabic(message)) return message;
  return AR_ERROR_MESSAGES[code] ?? AR_FALLBACK_MESSAGE;
}
