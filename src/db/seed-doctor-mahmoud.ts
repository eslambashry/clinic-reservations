import { prisma } from './client';

/**
 * Standalone demo-data seed for one specific doctor account
 * (`+201055555555`), independent of `seed.ts`'s general reference data.
 *
 * Fully idempotent: every write is an `upsert` keyed on a fixed UUID, so
 * running this against a fresh database creates the doctor, clinic, 4
 * branches, schedule templates, patients and appointments from scratch;
 * running it again against a database that already has this data updates
 * it in place rather than duplicating rows. Safe to hand to any teammate
 * pointing at their own local Postgres.
 *
 * Run with: `npx tsx src/db/seed-doctor-mahmoud.ts`
 */

const DOCTOR_PHONE = '+201055555555';

// Fixed ids so re-running this script is a no-op update, not a duplicate
// insert — all under one easily-greppable prefix.
const IDS = {
  user: 'aaaaaaaa-0000-4000-8000-000000000001',
  doctor: 'aaaaaaaa-0000-4000-8000-000000000002',
  clinic: 'aaaaaaaa-0000-4000-8000-000000000003',

  branchCairoAddress: 'aaaaaaaa-0000-4000-8000-000000000010',
  branchCairo: 'aaaaaaaa-0000-4000-8000-000000000011',
  affCairo: 'aaaaaaaa-0000-4000-8000-000000000012',

  branchGizaAddress: 'aaaaaaaa-0000-4000-8000-000000000020',
  branchGiza: 'aaaaaaaa-0000-4000-8000-000000000021',
  affGiza: 'aaaaaaaa-0000-4000-8000-000000000022',

  branchAlexAddress: 'aaaaaaaa-0000-4000-8000-000000000030',
  branchAlex: 'aaaaaaaa-0000-4000-8000-000000000031',
  affAlex: 'aaaaaaaa-0000-4000-8000-000000000032',

  branchMansouraAddress: 'aaaaaaaa-0000-4000-8000-000000000040',
  branchMansoura: 'aaaaaaaa-0000-4000-8000-000000000041',
  affMansoura: 'aaaaaaaa-0000-4000-8000-000000000042',
} as const;

/** One row per weekday×branch — deliberately non-overlapping (Part 33.6/33.8). */
const SCHEDULE_TEMPLATES = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000101', affiliationId: IDS.affCairo, weekday: 6, start: '09:00', end: '13:00' }, // Sat
  { id: 'aaaaaaaa-0000-4000-8000-000000000102', affiliationId: IDS.affCairo, weekday: 1, start: '09:00', end: '13:00' }, // Mon
  { id: 'aaaaaaaa-0000-4000-8000-000000000103', affiliationId: IDS.affCairo, weekday: 3, start: '09:00', end: '13:00' }, // Wed
  { id: 'aaaaaaaa-0000-4000-8000-000000000104', affiliationId: IDS.affGiza, weekday: 7, start: '14:00', end: '18:00' }, // Sun
  { id: 'aaaaaaaa-0000-4000-8000-000000000105', affiliationId: IDS.affGiza, weekday: 2, start: '14:00', end: '18:00' }, // Tue
  { id: 'aaaaaaaa-0000-4000-8000-000000000106', affiliationId: IDS.affAlex, weekday: 4, start: '10:00', end: '14:00' }, // Thu
  { id: 'aaaaaaaa-0000-4000-8000-000000000107', affiliationId: IDS.affMansoura, weekday: 5, start: '11:00', end: '15:00' }, // Fri
];

const PATIENTS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000201', phone: '+201112223301', first: 'سارة', last: 'عبد الرحمن', email: 'sara.abdelrahman@example.com' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000202', phone: '+201112223302', first: 'كريم', last: 'الشناوي', email: 'karim.elshenawy@example.com' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000203', phone: '+201112223303', first: 'نور', last: 'حسام', email: 'nour.hossam@example.com' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000204', phone: '+201112223304', first: 'ياسمين', last: 'فتحي', email: 'yasmin.fathy@example.com' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000205', phone: '+201112223305', first: 'عمر', last: 'زكريا', email: 'omar.zakaria@example.com' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000206', phone: '+201112223306', first: 'هبة', last: 'الجندي', email: 'heba.elgendy@example.com' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000207', phone: '+201112223307', first: 'طارق', last: 'منصور', email: 'tarek.mansour@example.com' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000208', phone: '+201112223308', first: 'ريم', last: 'صلاح', email: 'reem.salah@example.com' },
] as const;

/** `dayOffset` is relative to the script's run date — kept relative (not a
 * fixed calendar date) so this stays useful whenever it's run, not just on
 * the day it was written. */
function relativeDate(dayOffset: number, hourUtc: number, minuteUtc = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return d;
}

async function upsertAddress(id: string, data: { line1: string; city: string; regionCode: string; countryCode: string; lat: number; lng: number }) {
  await prisma.address.upsert({
    where: { id },
    update: {
      line1: data.line1,
      city: data.city,
      region_code: data.regionCode,
      country_code: data.countryCode,
      geo_lat: data.lat,
      geo_lng: data.lng,
    },
    create: {
      id,
      line1: data.line1,
      city: data.city,
      region_code: data.regionCode,
      country_code: data.countryCode,
      geo_lat: data.lat,
      geo_lng: data.lng,
    },
  });
}

async function upsertBranch(id: string, clinicId: string, addressId: string, phone: string) {
  await prisma.clinicBranch.upsert({
    where: { id },
    update: { phone, iana_timezone: 'Africa/Cairo', status: 'VERIFIED' },
    create: {
      id,
      clinic_id: clinicId,
      address_id: addressId,
      phone,
      iana_timezone: 'Africa/Cairo',
      status: 'VERIFIED',
    },
  });
}

async function upsertAffiliation(id: string, doctorId: string, branchId: string, consultFee: string) {
  await prisma.doctorClinicAffiliation.upsert({
    where: { id },
    update: { consult_fee: consultFee, currency: 'EGP', status: 'ACTIVE' },
    create: {
      id,
      doctor_id: doctorId,
      clinic_branch_id: branchId,
      consult_fee: consultFee,
      currency: 'EGP',
      status: 'ACTIVE',
    },
  });
}

async function main() {
  console.log('🌱 Seeding demo doctor + clinics + patients + appointments…');

  // 1. User + Doctor profile — creates the account from scratch if this
  //    phone doesn't exist yet, updates it in place if it does.
  const user = await prisma.user.upsert({
    where: { phone: DOCTOR_PHONE },
    update: {
      first_name: 'محمود',
      last_name: 'طه',
      email: 'dr.mahmoud.taha@medsuper.example',
    },
    create: {
      id: IDS.user,
      phone: DOCTOR_PHONE,
      first_name: 'محمود',
      last_name: 'طه',
      email: 'dr.mahmoud.taha@medsuper.example',
      status: 'ACTIVE',
    },
  });

  const doctor = await prisma.doctor.upsert({
    where: { user_id: user.id },
    update: {
      bio: 'استشاري الأمراض الجلدية والتناسلية، خبرة أكثر من 10 سنوات في علاج حالات الجلد والشعر والتجميل الطبي.',
      degree: 'دكتوراه الأمراض الجلدية والتناسلية',
      experience_years: 10,
      status: 'VERIFIED',
    },
    create: {
      id: IDS.doctor,
      user_id: user.id,
      specialty_code: 'DERMATOLOGY',
      license_number: '55555',
      status: 'VERIFIED',
      license_verified_at: new Date(),
      region_code: 'CAI',
      bio: 'استشاري الأمراض الجلدية والتناسلية، خبرة أكثر من 10 سنوات في علاج حالات الجلد والشعر والتجميل الطبي.',
      degree: 'دكتوراه الأمراض الجلدية والتناسلية',
      experience_years: 10,
    },
  });

  const existingDoctorMembership = await prisma.roleMembership.findFirst({
    where: { user_id: user.id, role_code: 'DOCTOR', context_type: 'DOCTOR' },
  });
  if (!existingDoctorMembership) {
    await prisma.roleMembership.create({
      data: { user_id: user.id, role_code: 'DOCTOR', context_type: 'DOCTOR', status: 'ACTIVE' },
    });
  }
  console.log(`✅ Doctor profile: ${DOCTOR_PHONE} — د. محمود طه (${doctor.id})`);

  // 2. Clinic (one legal entity, 4 branches)
  await prisma.clinic.upsert({
    where: { id: IDS.clinic },
    update: {
      legal_name: 'مركز الدكتور محمود طه للأمراض الجلدية',
      brand_name: 'عيادات د. محمود طه',
      status: 'VERIFIED',
      verified_at: new Date(),
    },
    create: {
      id: IDS.clinic,
      legal_name: 'مركز الدكتور محمود طه للأمراض الجلدية',
      brand_name: 'عيادات د. محمود طه',
      tax_id: 'TAX-2026-778812',
      region_code: 'CAI',
      status: 'VERIFIED',
      verified_at: new Date(),
    },
  });

  // 3. Four branches — Cairo, Giza, Alexandria, Mansoura — each VERIFIED,
  //    real addresses, distinct consult fees, one schedule day apiece.
  await upsertAddress(IDS.branchCairoAddress, { line1: '15 شارع عباس العقاد، مدينة نصر', city: 'القاهرة', regionCode: 'CAI', countryCode: 'EG', lat: 30.0561, lng: 31.335 });
  await upsertBranch(IDS.branchCairo, IDS.clinic, IDS.branchCairoAddress, '+20222700100');
  await upsertAffiliation(IDS.affCairo, doctor.id, IDS.branchCairo, '300.00');

  await upsertAddress(IDS.branchGizaAddress, { line1: '22 المحور المركزي، الحي المتميز', city: 'السادس من أكتوبر', regionCode: 'GIZ', countryCode: 'EG', lat: 29.966, lng: 30.937 });
  await upsertBranch(IDS.branchGiza, IDS.clinic, IDS.branchGizaAddress, '+20238330200');
  await upsertAffiliation(IDS.affGiza, doctor.id, IDS.branchGiza, '250.00');

  await upsertAddress(IDS.branchAlexAddress, { line1: '5 شارع فؤاد، محطة الرمل', city: 'الإسكندرية', regionCode: 'ALX', countryCode: 'EG', lat: 31.1975, lng: 29.9097 });
  await upsertBranch(IDS.branchAlex, IDS.clinic, IDS.branchAlexAddress, '+20334800300');
  await upsertAffiliation(IDS.affAlex, doctor.id, IDS.branchAlex, '350.00');

  await upsertAddress(IDS.branchMansouraAddress, { line1: '3 شارع الجمهورية، حي الجامعة', city: 'المنصورة', regionCode: 'QAL', countryCode: 'EG', lat: 31.0409, lng: 31.3785 });
  await upsertBranch(IDS.branchMansoura, IDS.clinic, IDS.branchMansouraAddress, '+20502230400');
  await upsertAffiliation(IDS.affMansoura, doctor.id, IDS.branchMansoura, '280.00');

  console.log('✅ Clinic + 4 branches (Cairo, Giza, Alexandria, Mansoura)');

  // 4. Schedule templates — one non-overlapping weekday window per branch.
  for (const t of SCHEDULE_TEMPLATES) {
    await prisma.scheduleTemplate.upsert({
      where: { id: t.id },
      update: { weekday: t.weekday, start_time: t.start, end_time: t.end, slot_duration_minutes: 20, buffer_minutes: 5 },
      create: {
        id: t.id,
        doctor_clinic_affiliation_id: t.affiliationId,
        weekday: t.weekday,
        start_time: t.start,
        end_time: t.end,
        slot_duration_minutes: 20,
        buffer_minutes: 5,
      },
    });
  }
  console.log(`✅ ${SCHEDULE_TEMPLATES.length} schedule templates (no overlaps)`);

  // 5. Patient users (find-or-create by phone, same pattern the app's own
  //    walk-in booking uses) + PATIENT role membership.
  //
  // `phone` is the real unique key here, not `p.id` — if a user with this
  // phone already exists (e.g. from an earlier manual insert predating this
  // script), `upsert` reuses THEIR id rather than `p.id`. Every downstream
  // reference to a patient must go through this map, never through
  // `PATIENTS[i].id` directly, or appointments below would point at a
  // patient id nothing actually owns.
  const patientIdByPhone = new Map<string, string>();
  for (const p of PATIENTS) {
    const patientUser = await prisma.user.upsert({
      where: { phone: p.phone },
      update: { first_name: p.first, last_name: p.last, email: p.email },
      create: { id: p.id, phone: p.phone, first_name: p.first, last_name: p.last, email: p.email, status: 'ACTIVE' },
    });
    patientIdByPhone.set(p.phone, patientUser.id);

    const existingMembership = await prisma.roleMembership.findFirst({
      where: { user_id: patientUser.id, role_code: 'PATIENT', context_type: 'PATIENT' },
    });
    if (!existingMembership) {
      await prisma.roleMembership.create({
        data: { user_id: patientUser.id, role_code: 'PATIENT', context_type: 'PATIENT', status: 'ACTIVE' },
      });
    }
  }
  console.log(`✅ ${PATIENTS.length} patient accounts`);

  // 6. Appointments — a mix of past (COMPLETED/CANCELLED) and future
  //    (CONFIRMED), spread across all 4 branches, no two at the same time
  //    on the same branch. Each needs its own OPEN->BOOKED slot first.
  type SeedAppointment = {
    id: string;
    slotId: string;
    affiliationId: string;
    patientPhone: string;
    dayOffset: number;
    hourUtc: number;
    minuteUtc?: number;
    status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  };

  const APPOINTMENTS: SeedAppointment[] = [
    // past
    { id: 'aaaaaaaa-0000-4000-8000-000000000301', slotId: 'aaaaaaaa-0000-4000-8000-000000000401', affiliationId: IDS.affCairo, patientPhone: PATIENTS[0].phone, dayOffset: -7, hourUtc: 7, status: 'COMPLETED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000302', slotId: 'aaaaaaaa-0000-4000-8000-000000000402', affiliationId: IDS.affCairo, patientPhone: PATIENTS[6].phone, dayOffset: -7, hourUtc: 9, status: 'COMPLETED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000303', slotId: 'aaaaaaaa-0000-4000-8000-000000000403', affiliationId: IDS.affGiza, patientPhone: PATIENTS[2].phone, dayOffset: -6, hourUtc: 13, minuteUtc: 30, status: 'COMPLETED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000304', slotId: 'aaaaaaaa-0000-4000-8000-000000000404', affiliationId: IDS.affCairo, patientPhone: PATIENTS[7].phone, dayOffset: -5, hourUtc: 8, minuteUtc: 30, status: 'CANCELLED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000305', slotId: 'aaaaaaaa-0000-4000-8000-000000000405', affiliationId: IDS.affAlex, patientPhone: PATIENTS[4].phone, dayOffset: -2, hourUtc: 9, status: 'COMPLETED' },
    // future
    { id: 'aaaaaaaa-0000-4000-8000-000000000306', slotId: 'aaaaaaaa-0000-4000-8000-000000000406', affiliationId: IDS.affCairo, patientPhone: PATIENTS[0].phone, dayOffset: 1, hourUtc: 7, status: 'CONFIRMED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000307', slotId: 'aaaaaaaa-0000-4000-8000-000000000407', affiliationId: IDS.affCairo, patientPhone: PATIENTS[1].phone, dayOffset: 1, hourUtc: 8, status: 'CONFIRMED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000308', slotId: 'aaaaaaaa-0000-4000-8000-000000000408', affiliationId: IDS.affGiza, patientPhone: PATIENTS[2].phone, dayOffset: 2, hourUtc: 12, minuteUtc: 30, status: 'CONFIRMED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000309', slotId: 'aaaaaaaa-0000-4000-8000-000000000409', affiliationId: IDS.affCairo, patientPhone: PATIENTS[3].phone, dayOffset: 3, hourUtc: 7, minuteUtc: 30, status: 'CONFIRMED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000310', slotId: 'aaaaaaaa-0000-4000-8000-000000000410', affiliationId: IDS.affAlex, patientPhone: PATIENTS[4].phone, dayOffset: 6, hourUtc: 8, status: 'CONFIRMED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000311', slotId: 'aaaaaaaa-0000-4000-8000-000000000411', affiliationId: IDS.affMansoura, patientPhone: PATIENTS[5].phone, dayOffset: 7, hourUtc: 9, minuteUtc: 30, status: 'CONFIRMED' },
  ];

  for (const apt of APPOINTMENTS) {
    const patientId = patientIdByPhone.get(apt.patientPhone);
    if (!patientId) {
      throw new Error(`No patient user resolved for phone ${apt.patientPhone} — patient seeding must run before appointments.`);
    }
    const startAt = relativeDate(apt.dayOffset, apt.hourUtc, apt.minuteUtc ?? 0);
    const endAt = new Date(startAt.getTime() + 20 * 60_000);

    // Every seeded appointment (past or future, whatever its own status)
    // claims its slot — a slot is only ever OPEN before something books it.
    await prisma.appointmentSlot.upsert({
      where: { id: apt.slotId },
      update: { start_at: startAt, end_at: endAt, status: 'BOOKED' },
      create: {
        id: apt.slotId,
        doctor_clinic_affiliation_id: apt.affiliationId,
        start_at: startAt,
        end_at: endAt,
        status: 'BOOKED',
      },
    });

    await prisma.appointment.upsert({
      where: { id: apt.id },
      update: { status: apt.status },
      create: {
        id: apt.id,
        slot_id: apt.slotId,
        patient_id: patientId,
        doctor_clinic_affiliation_id: apt.affiliationId,
        status: apt.status,
        cancelled_reason: apt.status === 'CANCELLED' ? 'PATIENT_REQUEST' : null,
      },
    });
  }
  console.log(`✅ ${APPOINTMENTS.length} appointments (mix of past/future, no time conflicts)`);

  // 7. A few extra OPEN slots per branch, so the app's reschedule/booking
  //    pickers actually have something to offer beyond the already-booked
  //    ones above.
  const OPEN_SLOTS: { id: string; affiliationId: string; dayOffset: number; hourUtc: number; minuteUtc?: number }[] = [
    { id: 'aaaaaaaa-0000-4000-8000-000000000501', affiliationId: IDS.affCairo, dayOffset: 4, hourUtc: 7 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000502', affiliationId: IDS.affCairo, dayOffset: 4, hourUtc: 8 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000503', affiliationId: IDS.affGiza, dayOffset: 4, hourUtc: 12 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000504', affiliationId: IDS.affGiza, dayOffset: 4, hourUtc: 12, minuteUtc: 25 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000505', affiliationId: IDS.affAlex, dayOffset: 13, hourUtc: 8 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000506', affiliationId: IDS.affAlex, dayOffset: 13, hourUtc: 9 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000507', affiliationId: IDS.affMansoura, dayOffset: 14, hourUtc: 9, minuteUtc: 30 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000508', affiliationId: IDS.affMansoura, dayOffset: 14, hourUtc: 10, minuteUtc: 15 },
  ];

  for (const s of OPEN_SLOTS) {
    const startAt = relativeDate(s.dayOffset, s.hourUtc, s.minuteUtc ?? 0);
    const endAt = new Date(startAt.getTime() + 20 * 60_000);
    await prisma.appointmentSlot.upsert({
      where: { id: s.id },
      update: { start_at: startAt, end_at: endAt, status: 'OPEN' },
      create: { id: s.id, doctor_clinic_affiliation_id: s.affiliationId, start_at: startAt, end_at: endAt, status: 'OPEN' },
    });
  }
  console.log(`✅ ${OPEN_SLOTS.length} extra OPEN slots for booking/reschedule pickers`);

  console.log('🌱 Done.');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
