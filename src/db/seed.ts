import { prisma } from './client';

/**
 * File 11 Part 01: single-region MVP launch (Egypt) — 'EG' is the region
 * code every seeded/default policy_config row is scoped to.
 */
const DEFAULT_REGION = 'EG';

async function main() {
  console.log('🌱 Starting database seed verification...');

  // Seed roles (File 10 §3.3: "roles/permissions/role_permissions — static
  // seed data, not user-editable in MVP"). One row per role_memberships
  // context_type (File 11 Part 09/shared.prisma RoleContextType) so the
  // role_memberships.role_code FK has somewhere to point the moment any
  // module creates a membership — identity-auth seeds PATIENT for itself at
  // OTP-verify time; the rest exist now as reference data for later phases
  // (provider staff role_memberships are Admin-provisioned, not built yet).
  const rolesData = [
    { code: 'PATIENT', name: 'Patient' },
    { code: 'DOCTOR', name: 'Doctor' },
    { code: 'CLINIC_STAFF', name: 'Clinic Staff' },
    { code: 'PHARMACY_STAFF', name: 'Pharmacy Staff' },
    { code: 'LAB_STAFF', name: 'Lab Staff' },
    { code: 'ADMIN', name: 'Platform Admin' },
  ];

  for (const role of rolesData) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: role,
    });
  }
  console.log(`✅ Seeded ${rolesData.length} roles`);

  // Seed default cancellation-fee policy (File 11 Part 12: cancellation fee
  // is computed server-side from policy_configs, never hardcoded).
  const existingPolicy = await prisma.policyConfig.findFirst({
    where: { region_code: DEFAULT_REGION, policy_type: 'CANCELLATION_TIER' },
  });

  if (!existingPolicy) {
    const created = await prisma.policyConfig.create({
      data: {
        region_code: DEFAULT_REGION,
        policy_type: 'CANCELLATION_TIER',
        value: { feePercent: 10 },
      },
    });
    console.log(
      `✅ Seeded policy config: ${created.policy_type} (${created.region_code}) = ${JSON.stringify(created.value)}`,
    );
  }

  // Seed baseline specialties
  const specialtiesData = [
    { name_en: 'General Practice', name_ar: 'طب عام' },
    { name_en: 'Cardiology', name_ar: 'أمراض القلب' },
    { name_en: 'Dermatology', name_ar: 'أمراض الجلدية' },
    { name_en: 'Pediatrics', name_ar: 'طب الأطفال' },
  ];

  for (const spec of specialtiesData) {
    const existing = await prisma.specialty.findFirst({
      where: { name_en: spec.name_en },
    });

    if (!existing) {
      // `code` is Specialty's primary key (no separate `id`) — derived from
      // the English name, following the schema's snake_case convention.
      const code = spec.name_en.toUpperCase().replace(/[^A-Z]+/g, '_');
      const created = await prisma.specialty.create({
        data: { code, name_en: spec.name_en, name_ar: spec.name_ar },
      });
      console.log(`✅ Seeded specialty: ${created.name_en} / ${created.name_ar}`);
    }
  }

  // Phase 2 (Provider Directory, File 12 Part 32): a Platform Admin test
  // user, so there's someone who can actually call the verify/suspend
  // endpoints — Admin accounts are provisioned manually, no self-service
  // signup exists (File 11 07.1/07.3).
  let adminUser = await prisma.user.findUnique({ where: { phone: '+201000000001' } });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: { phone: '+201000000001', first_name: 'Platform', last_name: 'Admin' },
    });
    console.log(`✅ Seeded admin user: ${adminUser.phone}`);
  }
  const adminMembership = await prisma.roleMembership.findFirst({
    where: { user_id: adminUser.id, role_code: 'ADMIN', context_type: 'ADMIN' },
  });
  if (!adminMembership) {
    await prisma.roleMembership.create({
      data: { user_id: adminUser.id, role_code: 'ADMIN', context_type: 'ADMIN' },
    });
    console.log(`✅ Granted ADMIN role_membership to ${adminUser.phone}`);
  }

  // A seeded test doctor, PENDING, at an already-VERIFIED clinic branch —
  // this is what makes the Phase 2 Definition of Done runnable end-to-end
  // (File 11 Part 28 Phase 2 exit criterion): once an Admin verifies this
  // doctor, it becomes visible via `GET /v1/doctors/search` because its
  // affiliation/branch/clinic are already in good standing.
  const generalPractice = await prisma.specialty.findFirst({ where: { name_en: 'General Practice' } });
  let testDoctorUser = await prisma.user.findUnique({ where: { phone: '+201000000002' } });
  if (!testDoctorUser) {
    testDoctorUser = await prisma.user.create({
      data: { phone: '+201000000002', first_name: 'Mona', last_name: 'Fahmy' },
    });
    console.log(`✅ Seeded test doctor user: ${testDoctorUser.phone}`);
  }
  let testDoctor = await prisma.doctor.findUnique({ where: { user_id: testDoctorUser.id } });
  if (!testDoctor && generalPractice) {
    testDoctor = await prisma.doctor.create({
      data: {
        user_id: testDoctorUser.id,
        specialty_code: generalPractice.code,
        license_number: 'EG-MED-SEED-0001',
        region_code: DEFAULT_REGION,
      },
    });
    console.log(`✅ Seeded test doctor: ${testDoctor.id} (status=${testDoctor.status})`);
  }

  let testClinic = await prisma.clinic.findFirst({ where: { legal_name: 'Nile Medical Group LLC (Seed)' } });
  if (!testClinic) {
    testClinic = await prisma.clinic.create({
      data: {
        legal_name: 'Nile Medical Group LLC (Seed)',
        brand_name: 'Nile Clinic',
        region_code: DEFAULT_REGION,
        status: 'VERIFIED',
        verified_at: new Date(),
      },
    });
    console.log(`✅ Seeded test clinic: ${testClinic.id}`);
  }

  let testBranch = await prisma.clinicBranch.findFirst({ where: { clinic_id: testClinic.id } });
  if (!testBranch) {
    const address = await prisma.address.create({
      data: { line1: '12 Tahrir St', city: 'Cairo', region_code: DEFAULT_REGION, country_code: 'EG' },
    });
    testBranch = await prisma.clinicBranch.create({
      data: {
        clinic_id: testClinic.id,
        address_id: address.id,
        phone: '+20221234567',
        iana_timezone: 'Africa/Cairo',
        status: 'VERIFIED',
      },
    });
    console.log(`✅ Seeded test clinic branch: ${testBranch.id}`);
  }

  if (testDoctor) {
    let affiliation = await prisma.doctorClinicAffiliation.findFirst({
      where: { doctor_id: testDoctor.id, clinic_branch_id: testBranch.id },
    });
    if (!affiliation) {
      affiliation = await prisma.doctorClinicAffiliation.create({
        data: {
          doctor_id: testDoctor.id,
          clinic_branch_id: testBranch.id,
          consult_fee: '350.00',
          currency: 'EGP',
        },
      });
      console.log(`✅ Seeded affiliation: doctor ${testDoctor.id} <-> branch ${testBranch.id}`);
    }

    // Phase 3 (Availability, File 12 Part 33): one weekday template so the
    // exit criterion (real slots via GET /doctors/{id}/slots) is runnable
    // end-to-end — verify the doctor (Phase 2 flow) then run
    // GenerateSlotsUseCase. Monday 09:00-13:00, Africa/Cairo (the seeded
    // branch's timezone), 20-minute slots with a 5-minute buffer.
    const existingTemplate = await prisma.scheduleTemplate.findFirst({
      where: { doctor_clinic_affiliation_id: affiliation.id, weekday: 1 },
    });
    if (!existingTemplate) {
      await prisma.scheduleTemplate.create({
        data: {
          doctor_clinic_affiliation_id: affiliation.id,
          weekday: 1,
          start_time: '09:00',
          end_time: '13:00',
          slot_duration_minutes: 20,
          buffer_minutes: 5,
        },
      });
      console.log(`✅ Seeded schedule template: affiliation ${affiliation.id}, Monday 09:00-13:00`);
    }
  }

  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Database seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
