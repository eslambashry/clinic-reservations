import * as argon2 from '@node-rs/argon2';
import { REGION_CONSTANTS } from '../shared/config/constants';
import { prisma } from './client';

/**
 * File 11 Part 01: single-region MVP launch (Egypt) — every seeded/default
 * policy_config row is scoped to this region (shared with the runtime's
 * `PolicyConfigReader`, File 12 Part 36.1 — not duplicated as a second literal).
 */
const DEFAULT_REGION = REGION_CONSTANTS.DEFAULT_REGION_CODE;

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

  // Seed default commission-rate policy (File 11 Part 13: commission rate is
  // sourced from policy_configs at capture time, never hardcoded). Flat
  // placeholder rate, same engineering-placeholder status as the
  // CANCELLATION_TIER value above — File 10 doesn't state an exact
  // commission percentage anywhere (File 12 Part 36.2).
  const existingCommissionPolicy = await prisma.policyConfig.findFirst({
    where: { region_code: DEFAULT_REGION, policy_type: 'COMMISSION_RATE' },
  });

  if (!existingCommissionPolicy) {
    const createdCommission = await prisma.policyConfig.create({
      data: {
        region_code: DEFAULT_REGION,
        policy_type: 'COMMISSION_RATE',
        value: { ratePercent: 15 },
      },
    });
    console.log(
      `✅ Seeded policy config: ${createdCommission.policy_type} (${createdCommission.region_code}) = ${JSON.stringify(createdCommission.value)}`,
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

  // Phase 6 (Prescriptions, File 12 Part 37): a Pharmacy Staff test user, so
  // there's someone who can actually call the review queue/review endpoints
  // — pharmacy-staff role_memberships are Admin-provisioned, no self-service
  // signup exists (same pattern as the ADMIN seed above).
  let pharmacyStaffUser = await prisma.user.findUnique({ where: { phone: '+201000000003' } });
  if (!pharmacyStaffUser) {
    pharmacyStaffUser = await prisma.user.create({
      data: { phone: '+201000000003', first_name: 'Youssef', last_name: 'Adel' },
    });
    console.log(`✅ Seeded pharmacy staff user: ${pharmacyStaffUser.phone}`);
  }
  const pharmacyStaffMembership = await prisma.roleMembership.findFirst({
    where: { user_id: pharmacyStaffUser.id, role_code: 'PHARMACY_STAFF', context_type: 'PHARMACY_STAFF' },
  });
  if (!pharmacyStaffMembership) {
    await prisma.roleMembership.create({
      data: { user_id: pharmacyStaffUser.id, role_code: 'PHARMACY_STAFF', context_type: 'PHARMACY_STAFF' },
    });
    console.log(`✅ Granted PHARMACY_STAFF role_membership to ${pharmacyStaffUser.phone}`);
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

  // Demo pharmacies + branches — same shape as the clinic seed above, so the
  // Flutter app's pharmacy-detail/pharmacy-branch-detail screens (wired to
  // GET /v1/pharmacies/:id and GET /v1/pharmacy-branches/:id) have real data
  // to render against in local dev. Fixed (not auto-generated) ids so the
  // Flutter `pharmacy_booking` feature's own mock pharmacy list
  // (`mockPharmacies` in `pharmacy_search_providers.dart`, still hardcoded —
  // there's no GET /v1/pharmacies/search endpoint yet) can hardcode these
  // same UUIDs as its `id` field and actually resolve against this real
  // backend, instead of the placeholder `'ph1'`/`'ph2'`/`'ph3'` strings that
  // fail `ParseUUIDPipe` validation.
  const demoPharmacies = [
    {
      id: '00000000-0000-0000-0000-000000000101',
      legalName: 'Nile Pharma LLC (Seed)',
      brandName: 'Nile Pharmacy',
      branchId: '00000000-0000-0000-0000-000000000111',
      addressId: '00000000-0000-0000-0000-000000000121',
      addressLine1: '5 Zamalek Ave',
      phone: '+20221230001',
      deliveryCapable: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000102',
      legalName: 'Al Ezaby Pharmaceuticals Co. (Seed)',
      brandName: 'Al Ezaby Pharmacy',
      branchId: '00000000-0000-0000-0000-000000000112',
      addressId: '00000000-0000-0000-0000-000000000122',
      addressLine1: '18 King Fahd Rd',
      phone: '+20221230002',
      deliveryCapable: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000103',
      legalName: 'Community Pharma Group (Seed)',
      brandName: 'Community Pharmacy',
      branchId: '00000000-0000-0000-0000-000000000113',
      addressId: '00000000-0000-0000-0000-000000000123',
      addressLine1: '40 Al Olaya St',
      phone: '+20221230003',
      deliveryCapable: false,
    },
  ];

  for (const p of demoPharmacies) {
    await prisma.pharmacy.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        legal_name: p.legalName,
        brand_name: p.brandName,
        region_code: DEFAULT_REGION,
        status: 'VERIFIED',
        verified_at: new Date(),
      },
    });

    await prisma.address.upsert({
      where: { id: p.addressId },
      update: {},
      create: {
        id: p.addressId,
        line1: p.addressLine1,
        city: 'Cairo',
        region_code: DEFAULT_REGION,
        country_code: 'EG',
      },
    });

    await prisma.pharmacyBranch.upsert({
      where: { id: p.branchId },
      update: {},
      create: {
        id: p.branchId,
        pharmacy_id: p.id,
        address_id: p.addressId,
        phone: p.phone,
        iana_timezone: 'Africa/Cairo',
        delivery_capable: p.deliveryCapable,
        status: 'VERIFIED',
      },
    });
    console.log(`✅ Seeded demo pharmacy: ${p.brandName} (${p.id}), branch ${p.branchId}`);
  }

  // Laboratory module (un-postponed 2026-09-02, File 12 Part 47/48): one demo
  // laboratory + branch, same shape as the demoPharmacies block above, so
  // `medsuper-laboratory-dashboard`'s real-auth bridge has a real branch to
  // log a LAB_STAFF test user into. No LabOrder rows are seeded — the queue
  // starts empty until a real PATIENT creates one via `POST /v1/lab-orders`.
  const demoLabId = '00000000-0000-0000-0000-000000000201';
  const demoLabBranchId = '00000000-0000-0000-0000-000000000211';
  const demoLabAddressId = '00000000-0000-0000-0000-000000000221';

  await prisma.laboratory.upsert({
    where: { id: demoLabId },
    update: {},
    create: {
      id: demoLabId,
      legal_name: 'Nile Diagnostics LLC (Seed)',
      brand_name: 'Nile Labs',
      region_code: DEFAULT_REGION,
      status: 'VERIFIED',
      verified_at: new Date(),
    },
  });

  await prisma.address.upsert({
    where: { id: demoLabAddressId },
    update: {},
    create: {
      id: demoLabAddressId,
      line1: '9 Qasr El Nil St',
      city: 'Cairo',
      region_code: DEFAULT_REGION,
      country_code: 'EG',
    },
  });

  await prisma.labBranch.upsert({
    where: { id: demoLabBranchId },
    update: {},
    create: {
      id: demoLabBranchId,
      laboratory_id: demoLabId,
      address_id: demoLabAddressId,
      phone: '+20221230004',
      iana_timezone: 'Africa/Cairo',
      home_collection_capable: true,
      status: 'VERIFIED',
    },
  });
  console.log(`✅ Seeded demo laboratory: Nile Labs (${demoLabId}), branch ${demoLabBranchId}`);

  // A Lab Staff test user, password-login-ready — unlike the pharmacy staff
  // seed above (which never set password_hash, so it cannot actually log in
  // via POST /auth/password/login as committed), this one is, so
  // `medsuper-laboratory-dashboard`'s real-auth bridge is testable end-to-end
  // against a real local Postgres without a manual DB edit first. Same
  // hashing call `SetPasswordUseCase`/`LoginWithPasswordUseCase` use.
  const labStaffPassword = 'DevPass123!';
  let labStaffUser = await prisma.user.findUnique({ where: { phone: '+201000000004' } });
  if (!labStaffUser) {
    labStaffUser = await prisma.user.create({
      data: {
        phone: '+201000000004',
        first_name: 'Amina',
        last_name: 'Tarek',
        password_hash: await argon2.hash(labStaffPassword),
      },
    });
    console.log(`✅ Seeded lab staff user: ${labStaffUser.phone} (password: ${labStaffPassword})`);
  }
  const labStaffMembership = await prisma.roleMembership.findFirst({
    where: { user_id: labStaffUser.id, role_code: 'LAB_STAFF', context_type: 'LAB_STAFF' },
  });
  if (!labStaffMembership) {
    await prisma.roleMembership.create({
      data: { user_id: labStaffUser.id, role_code: 'LAB_STAFF', context_type: 'LAB_STAFF', context_id: demoLabBranchId },
    });
    console.log(`✅ Granted LAB_STAFF role_membership to ${labStaffUser.phone} (branch ${demoLabBranchId})`);
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
