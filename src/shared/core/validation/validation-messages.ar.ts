import { ValidationError } from '@nestjs/common';
import { containsArabic } from '../errors/error-messages.ar';

/**
 * Arabic copy for 400 `VALIDATION_ERROR` field failures.
 *
 * `class-validator` writes its own English sentences ("phone must be a
 * string", "property foo should not exist"). Those are the strings that end
 * up in `error.details.fields` and — in every client we ship — directly under
 * the offending input. Left alone they are the single largest source of
 * English text reaching an Arabic-speaking user, and there are far too many
 * of them to fix by hand-writing a `message` option on ~350 decorators.
 *
 * So the translation happens once, here, in the global pipe's
 * `exceptionFactory`: each failed constraint is rebuilt from its constraint
 * key (`isString`, `min`, `matches`, …) plus the field's Arabic label, and
 * the English original is discarded before it can be serialized.
 */

/**
 * Field name → Arabic label. Keys are the DTO property names as written in
 * `src/modules/**\/api/dto`. Anything unmapped falls back to the raw property
 * name, which reads acceptably for single English words and is still far
 * better than an untranslated English sentence.
 */
const AR_FIELD_LABELS: Readonly<Record<string, string>> = {
  // identity / auth
  phone: 'رقم الهاتف',
  password: 'كلمة المرور',
  newPassword: 'كلمة المرور الجديدة',
  currentPassword: 'كلمة المرور الحالية',
  code: 'رمز التحقق',
  otp: 'رمز التحقق',
  purpose: 'الغرض',
  refreshToken: 'رمز تجديد الجلسة',
  email: 'البريد الإلكتروني',
  displayName: 'الاسم المعروض',
  fullName: 'الاسم الكامل',
  name: 'الاسم',
  nameAr: 'الاسم بالعربية',
  nameEn: 'الاسم بالإنجليزية',
  role: 'الدور',
  roles: 'الأدوار',
  permissions: 'الصلاحيات',
  userId: 'المستخدم',

  // provider directory
  doctorId: 'الطبيب',
  clinicId: 'العيادة',
  branchId: 'الفرع',
  clinicBranchId: 'فرع العيادة',
  pharmacyId: 'الصيدلية',
  pharmacyBranchId: 'فرع الصيدلية',
  labBranchId: 'فرع المعمل',
  affiliationId: 'ارتباط الطبيب بالفرع',
  specialtyId: 'التخصص',
  specialtyIds: 'التخصصات',
  licenseNumber: 'رقم الترخيص',
  bio: 'نبذة تعريفية',
  address: 'العنوان',
  city: 'المدينة',
  governorate: 'المحافظة',
  lat: 'خط العرض',
  lng: 'خط الطول',
  latitude: 'خط العرض',
  longitude: 'خط الطول',
  photoDataUri: 'الصورة',
  photo_data_uri: 'الصورة',
  documentType: 'نوع المستند',
  documentUrl: 'رابط المستند',
  rejectionReason: 'سبب الرفض',

  // scheduling & appointments
  appointmentId: 'الموعد',
  holdId: 'الحجز المؤقت',
  slotId: 'الموعد المتاح',
  slotStart: 'بداية الموعد',
  slotEnd: 'نهاية الموعد',
  startTime: 'وقت البداية',
  endTime: 'وقت النهاية',
  startsAt: 'وقت البداية',
  endsAt: 'وقت النهاية',
  appointmentAt: 'موعد الزيارة',
  dayOfWeek: 'يوم الأسبوع',
  slotLengthMinutes: 'مدة الموعد بالدقائق',
  bufferMinutes: 'مدة الفاصل بالدقائق',
  timezone: 'المنطقة الزمنية',
  from: 'من تاريخ',
  to: 'إلى تاريخ',
  date: 'التاريخ',
  version: 'رقم النسخة',
  reason: 'السبب',
  cancellationReason: 'سبب الإلغاء',
  patientId: 'المريض',

  // prescriptions / pharmacy
  prescriptionId: 'الروشتة',
  prescriptionItemId: 'الصنف داخل الروشتة',
  pharmacyOrderId: 'طلب الصيدلية',
  imageUrl: 'رابط الصورة',
  imageUrls: 'روابط الصور',
  notes: 'الملاحظات',
  note: 'الملاحظة',
  items: 'الأصناف',
  quantity: 'الكمية',
  unitPrice: 'سعر الوحدة',
  totalPrice: 'الإجمالي',
  fulfillmentType: 'طريقة الاستلام',
  estimatedReadyMinutes: 'مدة التجهيز المتوقّعة',
  controlledSubstanceConfirmed: 'تأكيد الدواء الخاضع للرقابة',
  substitutionNote: 'ملاحظة البديل',
  deliveryAddress: 'عنوان التوصيل',

  // laboratory
  labOrderId: 'طلب التحاليل',
  labOrderItemId: 'التحليل المطلوب',
  resultId: 'النتيجة',
  testCodes: 'رموز التحاليل',
  catalogCode: 'رمز التحليل',
  collectionType: 'طريقة سحب العيّنة',
  prepInstructions: 'تعليمات التحضير',
  queueNumber: 'رقم الدور',
  recipientName: 'اسم المستلِم',
  fileLabel: 'اسم الملف',
  fileUrl: 'رابط الملف',
  isCritical: 'نتيجة حرجة',
  courierName: 'اسم المندوب',

  // paging / common query
  cursor: 'مؤشر الصفحة',
  limit: 'عدد النتائج',
  status: 'الحالة',
  sort: 'الترتيب',
  search: 'البحث',
  action: 'الإجراء',
  q: 'كلمة البحث',
};

function label(property: string): string {
  return AR_FIELD_LABELS[property] ?? property;
}

/**
 * Constraint key → Arabic sentence builder. `args` carries the decorator's
 * own constraint arguments (`@Min(1)` → `[1]`), which is what makes a
 * message like "لا يقل عن 1" possible without re-reading the DTO.
 */
type MessageBuilder = (field: string, args: readonly unknown[]) => string;

const AR_CONSTRAINTS: Readonly<Record<string, MessageBuilder>> = {
  // presence
  isDefined: (f) => `${f} مطلوب.`,
  isNotEmpty: (f) => `${f} مطلوب.`,
  isNotEmptyObject: (f) => `${f} مطلوب.`,

  // primitive types
  isString: (f) => `${f} يجب أن يكون نصًا.`,
  isNumber: (f) => `${f} يجب أن يكون رقمًا.`,
  isInt: (f) => `${f} يجب أن يكون رقمًا صحيحًا.`,
  isBoolean: (f) => `${f} يجب أن يكون صح أو خطأ.`,
  isArray: (f) => `${f} يجب أن يكون قائمة.`,
  isObject: (f) => `${f} يجب أن يكون كائنًا.`,
  isDecimal: (f) => `${f} يجب أن يكون رقمًا عشريًا صحيح الصيغة.`,
  isNumberString: (f) => `${f} يجب أن يكون رقمًا.`,

  // formats
  isUuid: (f) => `${f} غير صالح.`,
  isEmail: (f) => `${f} يجب أن يكون بريدًا إلكترونيًا صحيحًا.`,
  isUrl: (f) => `${f} يجب أن يكون رابطًا صحيحًا.`,
  isIso8601: (f) => `${f} يجب أن يكون تاريخًا ووقتًا بصيغة صحيحة.`,
  isDateString: (f) => `${f} يجب أن يكون تاريخًا بصيغة صحيحة.`,
  isDate: (f) => `${f} يجب أن يكون تاريخًا صحيحًا.`,
  isLatitude: (f) => `${f} يجب أن يكون خط عرض صحيحًا بين ‎-90 و‎90.`,
  isLongitude: (f) => `${f} يجب أن يكون خط طول صحيحًا بين ‎-180 و‎180.`,
  isPhoneNumber: (f) => `${f} يجب أن يكون رقم هاتف صحيحًا.`,
  matches: (f) => `${f} بصيغة غير صحيحة.`,

  // allowed values
  isEnum: (f, a) => `${f} يجب أن يكون أحد الخيارات المتاحة${optionList(a)}.`,
  isIn: (f, a) => `${f} يجب أن يكون أحد الخيارات المتاحة${optionList(a)}.`,
  isNotIn: (f) => `${f} يحمل قيمة غير مسموح بها.`,

  // numeric bounds
  min: (f, a) => `${f} يجب ألا يقل عن ${a[0]}.`,
  max: (f, a) => `${f} يجب ألا يزيد عن ${a[0]}.`,
  isPositive: (f) => `${f} يجب أن يكون أكبر من صفر.`,
  isNegative: (f) => `${f} يجب أن يكون أقل من صفر.`,

  // string / array length
  minLength: (f, a) => `${f} يجب ألا يقل عن ${a[0]} حرفًا.`,
  maxLength: (f, a) => `${f} يجب ألا يزيد عن ${a[0]} حرفًا.`,
  // `@Length(min, max)` registers under `isLength`, not `length`.
  isLength: (f, a) =>
    a.length > 1 && a[0] !== a[1]
      ? `${f} يجب أن يكون بين ${a[0]} و${a[1]} حرفًا.`
      : `${f} يجب أن يتكوّن من ${a[0]} حرفًا.`,
  arrayNotEmpty: (f) => `${f} يجب أن يحتوي على عنصر واحد على الأقل.`,
  arrayMinSize: (f, a) => `${f} يجب أن يحتوي على ${a[0]} عنصر على الأقل.`,
  arrayMaxSize: (f, a) => `${f} يجب ألا يحتوي على أكثر من ${a[0]} عنصر.`,
  arrayUnique: (f) => `${f} يحتوي على عناصر مكرَّرة.`,

  // project-specific decorator (`is-strong-password.decorator.ts`)
  isStrongPassword: () =>
    'كلمة المرور يجب أن تتكوّن من 8 إلى 64 حرفًا وتشمل حرفًا كبيرًا وحرفًا صغيرًا ورقمًا ورمزًا.',

  // `forbidNonWhitelisted: true`
  whitelistValidation: (f) => `${f} حقل غير معروف ولا يمكن إرساله.`,
};

/** " (مثال: VISIT، HOME_COLLECTION)" — only when the options are short and few. */
function optionList(args: readonly unknown[]): string {
  const values = args.flatMap((a) =>
    Array.isArray(a) ? a : typeof a === 'object' && a !== null ? Object.values(a) : [a],
  );
  const printable = values.filter((v) => typeof v === 'string' || typeof v === 'number');
  if (printable.length === 0 || printable.length > 8) return '';
  return `: ${printable.join('، ')}`;
}

/**
 * Rebuilds one `ValidationError` as Arabic sentences — one per failed
 * constraint, recursing into `@ValidateNested()` children so a bad element
 * inside `items[2]` still names the field the user can actually see.
 */
function translateOne(error: ValidationError, parentPath = ''): string[] {
  const path = parentPath ? `${parentPath}.${error.property}` : error.property;
  const messages: string[] = [];

  for (const [constraint, english] of Object.entries(error.constraints ?? {})) {
    const key = constraint.toLowerCase();
    const build = AR_CONSTRAINTS[constraint] ?? AR_CONSTRAINTS[key];
    // Unknown constraint (a decorator added later, or a custom one carrying
    // its own Arabic `message`): keep whatever it wrote if it is already
    // Arabic, otherwise fall back to a correct, if unspecific, Arabic line.
    messages.push(
      build
        ? build(label(error.property), constraintArgs(error, constraint))
        : containsArabic(english)
          ? english
          : `${label(error.property)} بصيغة غير صحيحة.`,
    );
  }

  for (const child of error.children ?? []) {
    messages.push(...translateOne(child, path));
  }

  return messages;
}

/**
 * `ValidationError` carries `contexts` but not the raw decorator arguments,
 * so bounds are recovered from the English original — the only place they
 * exist. `@Min(3)` writes "… must not be less than 3"; pulling the numbers
 * back out is what lets the Arabic sentence stay specific instead of
 * degrading to "قيمة غير صحيحة".
 */
function constraintArgs(error: ValidationError, constraint: string): readonly unknown[] {
  const english = error.constraints?.[constraint] ?? '';

  // `isIn`/`isEnum` list their options in the message body. Checked first:
  // an enum whose members contain digits would otherwise be read as bounds.
  if (constraint === 'isIn' || constraint === 'isEnum') {
    const options = english.match(/(?:one of the following values|be one of)\s*:?\s*(.+)$/i);
    return options ? options[1].replace(/\.$/, '').split(/\s*,\s*/) : [];
  }

  const numbers = english.match(/-?\d+(?:\.\d+)?/g);
  return numbers ? numbers.map(Number) : [];
}

/** Every failed field, as Arabic sentences, deduplicated and order-preserved. */
export function toArabicValidationMessages(errors: ValidationError[]): string[] {
  return [...new Set(errors.flatMap((error) => translateOne(error)))];
}
