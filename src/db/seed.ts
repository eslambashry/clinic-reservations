import * as argon2 from '@node-rs/argon2';
import { REGION_CONSTANTS } from '../shared/config/constants';
import { prisma } from './client';

/**
 * File 11 Part 01: single-region MVP launch (Egypt) — every seeded/default
 * policy_config row is scoped to this region (shared with the runtime's
 * `PolicyConfigReader`, File 12 Part 36.1 — not duplicated as a second literal).
 */
const DEFAULT_REGION = REGION_CONSTANTS.DEFAULT_REGION_CODE;

/** Same derivation the original specialtiesData loop used inline — factored out so doctor seed blocks below can resolve a specialty's code from its English name without a second literal. */
function specialtyCode(nameEn: string): string {
  return nameEn.toUpperCase().replace(/[^A-Z]+/g, '_');
}

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

  // Seed baseline + demo-data specialties (File 10 §3.3: specialties are
  // static reference data). The original four are the load-bearing baseline
  // the test doctor below depends on; the rest exist so the doctor roster
  // further down has real variety to search/filter across.
  const specialtiesData = [
    { name_en: 'General Practice', name_ar: 'طب عام' },
    { name_en: 'Cardiology', name_ar: 'أمراض القلب' },
    { name_en: 'Dermatology', name_ar: 'أمراض الجلدية' },
    { name_en: 'Pediatrics', name_ar: 'طب الأطفال' },
    { name_en: 'Orthopedics', name_ar: 'جراحة العظام' },
    { name_en: 'Otolaryngology', name_ar: 'أنف وأذن وحنجرة' },
    { name_en: 'Ophthalmology', name_ar: 'طب وجراحة العيون' },
    { name_en: 'Neurology', name_ar: 'طب المخ والأعصاب' },
    { name_en: 'Psychiatry', name_ar: 'الطب النفسي' },
    { name_en: 'Obstetrics and Gynecology', name_ar: 'أمراض النساء والتوليد' },
    { name_en: 'Urology', name_ar: 'المسالك البولية' },
    { name_en: 'Endocrinology', name_ar: 'الغدد الصماء' },
    { name_en: 'Gastroenterology', name_ar: 'الجهاز الهضمي' },
    { name_en: 'Pulmonology', name_ar: 'الصدر' },
    { name_en: 'Dentistry', name_ar: 'طب الأسنان' },
    { name_en: 'Family Medicine', name_ar: 'طب الأسرة' },
    { name_en: 'Rheumatology', name_ar: 'أمراض الروماتيزم' },
    { name_en: 'Hematology', name_ar: 'أمراض الدم' },
    { name_en: 'Nephrology', name_ar: 'أمراض الكلى' },
    { name_en: 'Allergy and Immunology', name_ar: 'الحساسية والمناعة' },
    { name_en: 'Internal Medicine', name_ar: 'الباطنة العامة' },
    
  ];

  for (const spec of specialtiesData) {
    const existing = await prisma.specialty.findFirst({
      where: { name_en: spec.name_en },
    });

    if (!existing) {
      // `code` is Specialty's primary key (no separate `id`) — derived from
      // the English name, following the schema's snake_case convention.
      const code = specialtyCode(spec.name_en);
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

  // ---------------------------------------------------------------------
  // Drug catalog — reference data for Prescriptions/Pharmacy Fulfillment
  // (`prescription_items.drug_code` / `pharmacy_order_items.substituted_drug_code`,
  // File 12 Part 37). Grouped by therapeutic category below in comments only
  // — there's no `category` column on `DrugCatalog` (File 11/File 12 don't
  // define one), so category is just how this list is organized, not a
  // schema concept. `controlled_substance: true` marks the ones that route
  // through `PrescriptionReview.controlled_substance_confirmed`
  // (File 12 Part 37.4); `requires_prescription: false` marks OTC items.
  const drugCatalogData: {
    code: string;
    generic_name: string;
    controlled_substance?: boolean;
    requires_prescription?: boolean;
  }[] = [
    // Analgesics & Antipyretics
    { code: 'PARACETAMOL_500MG', generic_name: 'Paracetamol 500mg', requires_prescription: false },
    { code: 'IBUPROFEN_400MG', generic_name: 'Ibuprofen 400mg', requires_prescription: false },
    { code: 'DICLOFENAC_50MG', generic_name: 'Diclofenac Sodium 50mg' },
    { code: 'ASPIRIN_75MG', generic_name: 'Aspirin 75mg', requires_prescription: false },
    { code: 'NAPROXEN_500MG', generic_name: 'Naproxen 500mg' },
    // Antibiotics
    { code: 'AMOXICILLIN_500MG', generic_name: 'Amoxicillin 500mg' },
    { code: 'AZITHROMYCIN_250MG', generic_name: 'Azithromycin 250mg' },
    { code: 'CIPROFLOXACIN_500MG', generic_name: 'Ciprofloxacin 500mg' },
    { code: 'CEPHALEXIN_500MG', generic_name: 'Cephalexin 500mg' },
    { code: 'METRONIDAZOLE_400MG', generic_name: 'Metronidazole 400mg' },
    { code: 'DOXYCYCLINE_100MG', generic_name: 'Doxycycline 100mg' },
    { code: 'CLARITHROMYCIN_500MG', generic_name: 'Clarithromycin 500mg' },
    // Antihypertensives
    { code: 'AMLODIPINE_5MG', generic_name: 'Amlodipine 5mg' },
    { code: 'LOSARTAN_50MG', generic_name: 'Losartan 50mg' },
    { code: 'BISOPROLOL_5MG', generic_name: 'Bisoprolol 5mg' },
    { code: 'ENALAPRIL_10MG', generic_name: 'Enalapril 10mg' },
    { code: 'VALSARTAN_80MG', generic_name: 'Valsartan 80mg' },
    // Antidiabetics
    { code: 'METFORMIN_500MG', generic_name: 'Metformin 500mg' },
    { code: 'GLICLAZIDE_80MG', generic_name: 'Gliclazide 80mg' },
    { code: 'INSULIN_GLARGINE', generic_name: 'Insulin Glargine' },
    { code: 'SITAGLIPTIN_100MG', generic_name: 'Sitagliptin 100mg' },
    // Antihistamines / Allergy
    { code: 'CETIRIZINE_10MG', generic_name: 'Cetirizine 10mg', requires_prescription: false },
    { code: 'LORATADINE_10MG', generic_name: 'Loratadine 10mg', requires_prescription: false },
    { code: 'CHLORPHENIRAMINE_4MG', generic_name: 'Chlorpheniramine 4mg', requires_prescription: false },
    { code: 'FEXOFENADINE_120MG', generic_name: 'Fexofenadine 120mg', requires_prescription: false },
    // Gastrointestinal
    { code: 'OMEPRAZOLE_20MG', generic_name: 'Omeprazole 20mg' },
    { code: 'ESOMEPRAZOLE_40MG', generic_name: 'Esomeprazole 40mg' },
    { code: 'DOMPERIDONE_10MG', generic_name: 'Domperidone 10mg' },
    { code: 'LOPERAMIDE_2MG', generic_name: 'Loperamide 2mg', requires_prescription: false },
    { code: 'MEBEVERINE_135MG', generic_name: 'Mebeverine 135mg' },
    // Respiratory
    { code: 'SALBUTAMOL_INHALER', generic_name: 'Salbutamol Inhaler 100mcg' },
    { code: 'MONTELUKAST_10MG', generic_name: 'Montelukast 10mg' },
    { code: 'BROMHEXINE_8MG', generic_name: 'Bromhexine 8mg', requires_prescription: false },
    { code: 'GUAIFENESIN_SYRUP', generic_name: 'Guaifenesin Syrup', requires_prescription: false },
    // Cardiac / Lipid
    { code: 'ATORVASTATIN_20MG', generic_name: 'Atorvastatin 20mg' },
    { code: 'ROSUVASTATIN_10MG', generic_name: 'Rosuvastatin 10mg' },
    { code: 'CLOPIDOGREL_75MG', generic_name: 'Clopidogrel 75mg' },
    // Vitamins & Supplements
    { code: 'VITAMIN_D3_5000IU', generic_name: 'Vitamin D3 5000 IU', requires_prescription: false },
    { code: 'VITAMIN_B12_1000MCG', generic_name: 'Vitamin B12 1000mcg', requires_prescription: false },
    { code: 'FOLIC_ACID_5MG', generic_name: 'Folic Acid 5mg', requires_prescription: false },
    { code: 'MULTIVITAMIN_TABLET', generic_name: 'Multivitamin Tablet', requires_prescription: false },
    { code: 'CALCIUM_CARBONATE_600MG', generic_name: 'Calcium Carbonate 600mg', requires_prescription: false },
    { code: 'FERROUS_SULFATE_325MG', generic_name: 'Ferrous Sulfate 325mg', requires_prescription: false },
    { code: 'VITAMIN_C_1000MG', generic_name: 'Vitamin C 1000mg', requires_prescription: false },
    // Dermatology
    { code: 'HYDROCORTISONE_CREAM_1PCT', generic_name: 'Hydrocortisone Cream 1%' },
    { code: 'CLOTRIMAZOLE_CREAM_1PCT', generic_name: 'Clotrimazole Cream 1%', requires_prescription: false },
    { code: 'BETAMETHASONE_CREAM', generic_name: 'Betamethasone Cream 0.1%' },
    // Controlled substances
    { code: 'TRAMADOL_50MG', generic_name: 'Tramadol 50mg', controlled_substance: true },
    { code: 'DIAZEPAM_5MG', generic_name: 'Diazepam 5mg', controlled_substance: true },
    { code: 'CODEINE_PHOSPHATE_30MG', generic_name: 'Codeine Phosphate 30mg', controlled_substance: true },
    { code: 'ALPRAZOLAM_0_5MG', generic_name: 'Alprazolam 0.5mg', controlled_substance: true },
  ];

  let drugCount = 0;
  for (const drug of drugCatalogData) {
    const result = await prisma.drugCatalog.upsert({
      where: { code: drug.code },
      update: {},
      create: {
        code: drug.code,
        generic_name: drug.generic_name,
        controlled_substance: drug.controlled_substance ?? false,
        requires_prescription: drug.requires_prescription ?? true,
      },
    });
    if (result) drugCount++;
  }
  console.log(`✅ Seeded ${drugCount} drug catalog entries`);

  // ---------------------------------------------------------------------
  // Test catalog — reference data for Laboratory (`lab_order_items.catalog_code`).
  const testCatalogData: { code: string; display_name: string }[] = [
    { code: 'CBC', display_name: 'Complete Blood Count (CBC)' },
    { code: 'ESR', display_name: 'Erythrocyte Sedimentation Rate (ESR)' },
    { code: 'CRP', display_name: 'C-Reactive Protein (CRP)' },
    { code: 'FBS', display_name: 'Fasting Blood Sugar (FBS)' },
    { code: 'RBS', display_name: 'Random Blood Sugar (RBS)' },
    { code: 'HBA1C', display_name: 'Glycated Hemoglobin (HbA1c)' },
    { code: 'LIPID_PROFILE', display_name: 'Lipid Profile' },
    { code: 'LFT', display_name: 'Liver Function Test (LFT)' },
    { code: 'KFT', display_name: 'Kidney Function Test (KFT)' },
    { code: 'URINALYSIS', display_name: 'Complete Urinalysis' },
    { code: 'STOOL_ANALYSIS', display_name: 'Stool Analysis' },
    { code: 'TSH', display_name: 'Thyroid Stimulating Hormone (TSH)' },
    { code: 'FREE_T3', display_name: 'Free Triiodothyronine (Free T3)' },
    { code: 'FREE_T4', display_name: 'Free Thyroxine (Free T4)' },
    { code: 'VIT_D', display_name: 'Vitamin D (25-OH)' },
    { code: 'VIT_B12', display_name: 'Vitamin B12' },
    { code: 'IRON_STUDIES', display_name: 'Iron Studies (Serum Iron, TIBC, Ferritin)' },
    { code: 'ELECTROLYTES', display_name: 'Electrolytes Panel (Na/K/Cl)' },
    { code: 'COAG_PROFILE', display_name: 'Coagulation Profile (PT/PTT/INR)' },
    { code: 'BETA_HCG', display_name: 'Beta hCG (Pregnancy Test)' },
    { code: 'HBSAG', display_name: 'Hepatitis B Surface Antigen (HBsAg)' },
    { code: 'HCV_AB', display_name: 'Hepatitis C Antibody (HCV Ab)' },
    { code: 'HIV_SCREEN', display_name: 'HIV Screening Test' },
    { code: 'PSA', display_name: 'Prostate Specific Antigen (PSA)' },
    { code: 'BLOOD_GROUP', display_name: 'Blood Group & Rh Factor' },
    { code: 'URINE_CULTURE', display_name: 'Urine Culture & Sensitivity' },
    { code: 'C_PEPTIDE', display_name: 'C-Peptide' },
  ];

  let testCount = 0;
  for (const test of testCatalogData) {
    await prisma.testCatalog.upsert({
      where: { code: test.code },
      update: {},
      create: { code: test.code, display_name: test.display_name },
    });
    testCount++;
  }
  console.log(`✅ Seeded ${testCount} test catalog entries`);

  // ---------------------------------------------------------------------
  // More demo pharmacy chains + branches + PHARMACY_STAFF accounts — same
  // shape as `demoPharmacies` above, extended with a password-login-ready
  // staff user per branch (same pattern the lab staff seed below uses) and,
  // critically, `context_id: branchId` on the role_membership: broadcast
  // accept/decline (`AcceptPharmacyOrderBroadcastUseCase`) reads the acting
  // branch from `membership.contextId`, so a PHARMACY_STAFF membership
  // without it (like the single `pharmacyStaffUser` seeded above) can never
  // actually claim a broadcast — these accounts are branch-scoped on purpose.
  const pharmacyStaffPassword = 'DevPass123!';
  const demoPharmacyChains = [
    {
      id: '00000000-0000-0000-0000-000000000130',
      legalName: 'Seif Pharmaceutical Group LLC (Seed)',
      brandName: 'Seif Pharmacy',
      branches: [
        {
          id: '00000000-0000-0000-0000-000000000131',
          addressId: '00000000-0000-0000-0000-000000000141',
          addressLine1: 'Road 9, Maadi',
          city: 'Cairo',
          phone: '+20221230011',
          deliveryCapable: true,
          staffPhone: '+201000000010',
          staffFirstName: 'Mostafa',
          staffLastName: 'Younes',
        },
        {
          id: '00000000-0000-0000-0000-000000000132',
          addressId: '00000000-0000-0000-0000-000000000142',
          addressLine1: 'Abbas El Akkad St, Nasr City',
          city: 'Cairo',
          phone: '+20221230012',
          deliveryCapable: true,
          staffPhone: '+201000000011',
          staffFirstName: 'Aya',
          staffLastName: 'Hassan',
        },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000150',
      legalName: 'El Dawaa Pharmaceuticals Co. (Seed)',
      brandName: 'El Dawaa Pharmacy',
      branches: [
        {
          id: '00000000-0000-0000-0000-000000000151',
          addressId: '00000000-0000-0000-0000-000000000161',
          addressLine1: 'Baghdad St, Heliopolis',
          city: 'Cairo',
          phone: '+20221230013',
          deliveryCapable: true,
          staffPhone: '+201000000012',
          staffFirstName: 'Sherif',
          staffLastName: 'Kamel',
        },
        {
          id: '00000000-0000-0000-0000-000000000152',
          addressId: '00000000-0000-0000-0000-000000000162',
          addressLine1: 'Gamet El Dowal St, Mohandessin',
          city: 'Giza',
          phone: '+20221230014',
          deliveryCapable: false,
          staffPhone: '+201000000013',
          staffFirstName: 'Nourhan',
          staffLastName: 'Sabry',
        },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000170',
      legalName: 'Rowad Modern Pharmacy Co. (Seed)',
      brandName: '19011 Pharmacy',
      branches: [
        {
          id: '00000000-0000-0000-0000-000000000171',
          addressId: '00000000-0000-0000-0000-000000000181',
          addressLine1: '26th of July St, Zamalek',
          city: 'Cairo',
          phone: '+20221230015',
          deliveryCapable: true,
          staffPhone: '+201000000014',
          staffFirstName: 'Mina',
          staffLastName: 'Fawzy',
        },
        {
          id: '00000000-0000-0000-0000-000000000172',
          addressId: '00000000-0000-0000-0000-000000000182',
          addressLine1: 'Tahrir St, Dokki',
          city: 'Giza',
          phone: '+20221230016',
          deliveryCapable: true,
          staffPhone: '+201000000015',
          staffFirstName: 'Rania',
          staffLastName: 'Hosny',
        },
      ],
    },
  ];

  for (const chain of demoPharmacyChains) {
    await prisma.pharmacy.upsert({
      where: { id: chain.id },
      update: {},
      create: {
        id: chain.id,
        legal_name: chain.legalName,
        brand_name: chain.brandName,
        region_code: DEFAULT_REGION,
        status: 'VERIFIED',
        verified_at: new Date(),
      },
    });

    for (const branch of chain.branches) {
      await prisma.address.upsert({
        where: { id: branch.addressId },
        update: {},
        create: {
          id: branch.addressId,
          line1: branch.addressLine1,
          city: branch.city,
          region_code: DEFAULT_REGION,
          country_code: 'EG',
        },
      });

      await prisma.pharmacyBranch.upsert({
        where: { id: branch.id },
        update: {},
        create: {
          id: branch.id,
          pharmacy_id: chain.id,
          address_id: branch.addressId,
          phone: branch.phone,
          iana_timezone: 'Africa/Cairo',
          delivery_capable: branch.deliveryCapable,
          status: 'VERIFIED',
        },
      });

      let staffUser = await prisma.user.findUnique({ where: { phone: branch.staffPhone } });
      if (!staffUser) {
        staffUser = await prisma.user.create({
          data: {
            phone: branch.staffPhone,
            first_name: branch.staffFirstName,
            last_name: branch.staffLastName,
            password_hash: await argon2.hash(pharmacyStaffPassword),
          },
        });
      }
      const staffMembership = await prisma.roleMembership.findFirst({
        where: { user_id: staffUser.id, role_code: 'PHARMACY_STAFF', context_type: 'PHARMACY_STAFF', context_id: branch.id },
      });
      if (!staffMembership) {
        await prisma.roleMembership.create({
          data: { user_id: staffUser.id, role_code: 'PHARMACY_STAFF', context_type: 'PHARMACY_STAFF', context_id: branch.id },
        });
      }
      console.log(
        `✅ Seeded pharmacy branch: ${chain.brandName} — ${branch.addressLine1} (${branch.id}), staff ${branch.staffPhone} (password: ${pharmacyStaffPassword})`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // More demo laboratory chains + branches + LAB_STAFF accounts — same shape
  // as the single `demoLabId`/`demoLabBranchId` block above.
  const demoLabChains = [
    {
      id: '00000000-0000-0000-0000-000000000230',
      legalName: 'Al Borg Diagnostics LLC (Seed)',
      brandName: 'Al Borg Laboratories',
      branches: [
        {
          id: '00000000-0000-0000-0000-000000000231',
          addressId: '00000000-0000-0000-0000-000000000241',
          addressLine1: 'Corniche El Nil, Maadi',
          city: 'Cairo',
          phone: '+20221230020',
          homeCollectionCapable: true,
          staffPhone: '+201000000020',
          staffFirstName: 'Ola',
          staffLastName: 'Ashraf',
        },
        {
          id: '00000000-0000-0000-0000-000000000232',
          addressId: '00000000-0000-0000-0000-000000000242',
          addressLine1: 'Makram Ebeid St, Nasr City',
          city: 'Cairo',
          phone: '+20221230021',
          homeCollectionCapable: true,
          staffPhone: '+201000000021',
          staffFirstName: 'Fady',
          staffLastName: 'Naeem',
        },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000250',
      legalName: 'Alfa Scan & Laboratories Co. (Seed)',
      brandName: 'Alfa Lab',
      branches: [
        {
          id: '00000000-0000-0000-0000-000000000251',
          addressId: '00000000-0000-0000-0000-000000000261',
          addressLine1: 'El Merghany St, Heliopolis',
          city: 'Cairo',
          phone: '+20221230022',
          homeCollectionCapable: false,
          staffPhone: '+201000000022',
          staffFirstName: 'Hala',
          staffLastName: 'Kotb',
        },
        {
          id: '00000000-0000-0000-0000-000000000252',
          addressId: '00000000-0000-0000-0000-000000000262',
          addressLine1: 'Sudan St, Mohandessin',
          city: 'Giza',
          phone: '+20221230023',
          homeCollectionCapable: true,
          staffPhone: '+201000000023',
          staffFirstName: 'Wael',
          staffLastName: 'Fahim',
        },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000270',
      legalName: 'Cairo Scan Diagnostic Center (Seed)',
      brandName: 'Cairo Scan Labs',
      branches: [
        {
          id: '00000000-0000-0000-0000-000000000271',
          addressId: '00000000-0000-0000-0000-000000000281',
          addressLine1: 'Hassan Sabry St, Zamalek',
          city: 'Cairo',
          phone: '+20221230024',
          homeCollectionCapable: true,
          staffPhone: '+201000000024',
          staffFirstName: 'Nadia',
          staffLastName: 'Refaat',
        },
        {
          id: '00000000-0000-0000-0000-000000000272',
          addressId: '00000000-0000-0000-0000-000000000282',
          addressLine1: 'Central Axis, 6th of October City',
          city: 'Giza',
          phone: '+20221230025',
          homeCollectionCapable: false,
          staffPhone: '+201000000025',
          staffFirstName: 'Ziad',
          staffLastName: 'Mansour',
        },
      ],
    },
  ];

  for (const chain of demoLabChains) {
    await prisma.laboratory.upsert({
      where: { id: chain.id },
      update: {},
      create: {
        id: chain.id,
        legal_name: chain.legalName,
        brand_name: chain.brandName,
        region_code: DEFAULT_REGION,
        status: 'VERIFIED',
        verified_at: new Date(),
      },
    });

    for (const branch of chain.branches) {
      await prisma.address.upsert({
        where: { id: branch.addressId },
        update: {},
        create: {
          id: branch.addressId,
          line1: branch.addressLine1,
          city: branch.city,
          region_code: DEFAULT_REGION,
          country_code: 'EG',
        },
      });

      await prisma.labBranch.upsert({
        where: { id: branch.id },
        update: {},
        create: {
          id: branch.id,
          laboratory_id: chain.id,
          address_id: branch.addressId,
          phone: branch.phone,
          iana_timezone: 'Africa/Cairo',
          home_collection_capable: branch.homeCollectionCapable,
          status: 'VERIFIED',
        },
      });

      let staffUser = await prisma.user.findUnique({ where: { phone: branch.staffPhone } });
      if (!staffUser) {
        staffUser = await prisma.user.create({
          data: {
            phone: branch.staffPhone,
            first_name: branch.staffFirstName,
            last_name: branch.staffLastName,
            password_hash: await argon2.hash(labStaffPassword),
          },
        });
      }
      const staffMembership = await prisma.roleMembership.findFirst({
        where: { user_id: staffUser.id, role_code: 'LAB_STAFF', context_type: 'LAB_STAFF', context_id: branch.id },
      });
      if (!staffMembership) {
        await prisma.roleMembership.create({
          data: { user_id: staffUser.id, role_code: 'LAB_STAFF', context_type: 'LAB_STAFF', context_id: branch.id },
        });
      }
      console.log(
        `✅ Seeded lab branch: ${chain.brandName} — ${branch.addressLine1} (${branch.id}), staff ${branch.staffPhone} (password: ${labStaffPassword})`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // More demo clinics + branches + VERIFIED doctors — same shape as
  // `testClinic`/`testDoctor` above, but VERIFIED directly (not PENDING)
  // since the point of this block is a populated, immediately-searchable
  // `GET /v1/doctors/search` result set, not exercising the verify workflow
  // (that's what the single PENDING test doctor above already covers).
  const demoClinics = [
    {
      key: 'cairo-specialized',
      id: '00000000-0000-0000-0000-000000000301',
      branchId: '00000000-0000-0000-0000-000000000311',
      addressId: '00000000-0000-0000-0000-000000000321',
      legalName: 'Cairo Specialized Hospital Group (Seed)',
      brandName: 'Cairo Specialized Hospital',
      addressLine1: 'Ramses St, Downtown Cairo',
      city: 'Cairo',
      phone: '+20221240001',
    },
    {
      key: 'alexandria-medical',
      id: '00000000-0000-0000-0000-000000000302',
      branchId: '00000000-0000-0000-0000-000000000312',
      addressId: '00000000-0000-0000-0000-000000000322',
      legalName: 'Alexandria Medical Center LLC (Seed)',
      brandName: 'Alexandria Medical Center',
      addressLine1: 'Fouad St, Smouha',
      city: 'Alexandria',
      phone: '+20221240002',
    },
    {
      key: 'heliopolis-health',
      id: '00000000-0000-0000-0000-000000000303',
      branchId: '00000000-0000-0000-0000-000000000313',
      addressId: '00000000-0000-0000-0000-000000000323',
      legalName: 'Heliopolis Health Clinic Co. (Seed)',
      brandName: 'Heliopolis Health Clinic',
      addressLine1: 'El Ahram St, Heliopolis',
      city: 'Cairo',
      phone: '+20221240003',
    },
    {
      key: 'new-cairo-wellness',
      id: '00000000-0000-0000-0000-000000000304',
      branchId: '00000000-0000-0000-0000-000000000314',
      addressId: '00000000-0000-0000-0000-000000000324',
      legalName: 'New Cairo Wellness Clinic LLC (Seed)',
      brandName: 'New Cairo Wellness Clinic',
      addressLine1: 'Ninety Street, Fifth Settlement',
      city: 'New Cairo',
      phone: '+20221240004',
    },
    {
      key: 'giza-family-care',
      id: '00000000-0000-0000-0000-000000000305',
      branchId: '00000000-0000-0000-0000-000000000315',
      addressId: '00000000-0000-0000-0000-000000000325',
      legalName: 'Giza Family Care Center Co. (Seed)',
      brandName: 'Giza Family Care Center',
      addressLine1: 'Tahrir St, Dokki',
      city: 'Giza',
      phone: '+20221240005',
    },
    {
      key: 'maadi-medical-plaza',
      id: '00000000-0000-0000-0000-000000000306',
      branchId: '00000000-0000-0000-0000-000000000316',
      addressId: '00000000-0000-0000-0000-000000000326',
      legalName: 'Maadi Medical Plaza LLC (Seed)',
      brandName: 'Maadi Medical Plaza',
      addressLine1: 'Road 9, Maadi',
      city: 'Cairo',
      phone: '+20221240006',
    },
  ];

  const demoClinicBranchIdByKey = new Map<string, string>();
  for (const clinic of demoClinics) {
    await prisma.clinic.upsert({
      where: { id: clinic.id },
      update: {},
      create: {
        id: clinic.id,
        legal_name: clinic.legalName,
        brand_name: clinic.brandName,
        region_code: DEFAULT_REGION,
        status: 'VERIFIED',
        verified_at: new Date(),
      },
    });

    await prisma.address.upsert({
      where: { id: clinic.addressId },
      update: {},
      create: {
        id: clinic.addressId,
        line1: clinic.addressLine1,
        city: clinic.city,
        region_code: DEFAULT_REGION,
        country_code: 'EG',
      },
    });

    await prisma.clinicBranch.upsert({
      where: { id: clinic.branchId },
      update: {},
      create: {
        id: clinic.branchId,
        clinic_id: clinic.id,
        address_id: clinic.addressId,
        phone: clinic.phone,
        iana_timezone: 'Africa/Cairo',
        status: 'VERIFIED',
      },
    });
    demoClinicBranchIdByKey.set(clinic.key, clinic.branchId);
    console.log(`✅ Seeded clinic: ${clinic.brandName} (${clinic.id}), branch ${clinic.branchId}`);
  }

  // Sun=0 .. Sat=6 (JS `Date#getDay()` convention, matching the existing
  // Monday(1) test-doctor template above) — Egypt's Sun-Thu work week, with
  // a couple of Saturday/evening slots thrown in for variety.
  const demoDoctors: {
    phone: string;
    firstName: string;
    lastName: string;
    specialtyNameEn: string;
    licenseNumber: string;
    degree: string;
    bio: string;
    experienceYears: number;
    ratingAvg: string;
    ratingCount: number;
    clinicKey: string;
    consultFee: string;
    templates: { weekday: number; start: string; end: string }[];
  }[] = [
    {
      phone: '+201000000030',
      firstName: 'Ahmed',
      lastName: 'Hassan',
      specialtyNameEn: 'Cardiology',
      licenseNumber: 'EG-MED-2012-00101',
      degree: 'MBBCh, MD Cardiology',
      bio: 'Consultant cardiologist with a focus on hypertension and preventive heart care.',
      experienceYears: 16,
      ratingAvg: '4.8',
      ratingCount: 214,
      clinicKey: 'cairo-specialized',
      consultFee: '500.00',
      templates: [
        { weekday: 0, start: '09:00', end: '13:00' },
        { weekday: 2, start: '09:00', end: '13:00' },
      ],
    },
    {
      phone: '+201000000031',
      firstName: 'Heba',
      lastName: 'Magdy',
      specialtyNameEn: 'Cardiology',
      licenseNumber: 'EG-MED-2014-00102',
      degree: 'MBBCh, MSc Cardiology',
      bio: 'Cardiologist specializing in echocardiography and heart failure management.',
      experienceYears: 12,
      ratingAvg: '4.6',
      ratingCount: 132,
      clinicKey: 'maadi-medical-plaza',
      consultFee: '450.00',
      templates: [
        { weekday: 1, start: '17:00', end: '21:00' },
        { weekday: 3, start: '17:00', end: '21:00' },
      ],
    },
    {
      phone: '+201000000032',
      firstName: 'Sara',
      lastName: 'Youssef',
      specialtyNameEn: 'Dermatology',
      licenseNumber: 'EG-MED-2015-00103',
      degree: 'MBBCh, MSc Dermatology',
      bio: 'Dermatologist covering general skin conditions, acne, and cosmetic dermatology.',
      experienceYears: 10,
      ratingAvg: '4.7',
      ratingCount: 189,
      clinicKey: 'heliopolis-health',
      consultFee: '400.00',
      templates: [
        { weekday: 0, start: '10:00', end: '14:00' },
        { weekday: 3, start: '10:00', end: '14:00' },
      ],
    },
    {
      phone: '+201000000033',
      firstName: 'Khaled',
      lastName: 'Mostafa',
      specialtyNameEn: 'Pediatrics',
      licenseNumber: 'EG-MED-2010-00104',
      degree: 'MBBCh, MD Pediatrics',
      bio: 'Pediatrician with two decades of experience in newborn and child care.',
      experienceYears: 20,
      ratingAvg: '4.9',
      ratingCount: 301,
      clinicKey: 'new-cairo-wellness',
      consultFee: '300.00',
      templates: [
        { weekday: 6, start: '09:00', end: '13:00' },
        { weekday: 1, start: '09:00', end: '13:00' },
      ],
    },
    {
      phone: '+201000000034',
      firstName: 'Nourhan',
      lastName: 'Adel',
      specialtyNameEn: 'Orthopedics',
      licenseNumber: 'EG-MED-2013-00105',
      degree: 'MBBCh, MSc Orthopedic Surgery',
      bio: 'Orthopedic surgeon specializing in sports injuries and joint pain.',
      experienceYears: 13,
      ratingAvg: '4.5',
      ratingCount: 97,
      clinicKey: 'giza-family-care',
      consultFee: '450.00',
      templates: [
        { weekday: 2, start: '11:00', end: '15:00' },
        { weekday: 4, start: '11:00', end: '15:00' },
      ],
    },
    {
      phone: '+201000000035',
      firstName: 'Omar',
      lastName: 'Farouk',
      specialtyNameEn: 'Otolaryngology',
      licenseNumber: 'EG-MED-2016-00106',
      degree: 'MBBCh, MSc ENT Surgery',
      bio: 'ENT specialist treating sinus, ear, and throat conditions in adults and children.',
      experienceYears: 9,
      ratingAvg: '4.4',
      ratingCount: 76,
      clinicKey: 'maadi-medical-plaza',
      consultFee: '350.00',
      templates: [
        { weekday: 0, start: '12:00', end: '16:00' },
        { weekday: 2, start: '12:00', end: '16:00' },
      ],
    },
    {
      phone: '+201000000036',
      firstName: 'Dina',
      lastName: 'Samir',
      specialtyNameEn: 'Ophthalmology',
      licenseNumber: 'EG-MED-2011-00107',
      degree: 'MBBCh, MD Ophthalmology',
      bio: 'Ophthalmologist with a focus on cataract surgery and general eye care.',
      experienceYears: 15,
      ratingAvg: '4.7',
      ratingCount: 158,
      clinicKey: 'alexandria-medical',
      consultFee: '400.00',
      templates: [
        { weekday: 1, start: '09:00', end: '13:00' },
        { weekday: 3, start: '09:00', end: '13:00' },
      ],
    },
    {
      phone: '+201000000037',
      firstName: 'Tarek',
      lastName: 'Ibrahim',
      specialtyNameEn: 'Neurology',
      licenseNumber: 'EG-MED-2009-00108',
      degree: 'MBBCh, MD Neurology',
      bio: 'Neurologist managing migraines, epilepsy, and general neurological disorders.',
      experienceYears: 21,
      ratingAvg: '4.8',
      ratingCount: 245,
      clinicKey: 'cairo-specialized',
      consultFee: '600.00',
      templates: [
        { weekday: 4, start: '10:00', end: '14:00' },
        { weekday: 6, start: '10:00', end: '14:00' },
      ],
    },
    {
      phone: '+201000000038',
      firstName: 'Rana',
      lastName: 'Elshamy',
      specialtyNameEn: 'Psychiatry',
      licenseNumber: 'EG-MED-2017-00109',
      degree: 'MBBCh, MSc Psychiatry',
      bio: 'Psychiatrist focusing on anxiety, depression, and stress-related disorders.',
      experienceYears: 8,
      ratingAvg: '4.6',
      ratingCount: 84,
      clinicKey: 'new-cairo-wellness',
      consultFee: '500.00',
      templates: [
        { weekday: 0, start: '16:00', end: '20:00' },
        { weekday: 3, start: '16:00', end: '20:00' },
      ],
    },
    {
      phone: '+201000000039',
      firstName: 'Mahmoud',
      lastName: 'Saeed',
      specialtyNameEn: 'Obstetrics and Gynecology',
      licenseNumber: 'EG-MED-2008-00110',
      degree: 'MBBCh, MD Obstetrics and Gynecology',
      bio: 'OB/GYN consultant covering prenatal care, deliveries, and women\'s health.',
      experienceYears: 22,
      ratingAvg: '4.9',
      ratingCount: 267,
      clinicKey: 'heliopolis-health',
      consultFee: '450.00',
      templates: [
        { weekday: 1, start: '09:00', end: '13:00' },
        { weekday: 4, start: '09:00', end: '13:00' },
      ],
    },
    {
      phone: '+201000000040',
      firstName: 'Yara',
      lastName: 'Kamal',
      specialtyNameEn: 'Urology',
      licenseNumber: 'EG-MED-2014-00111',
      degree: 'MBBCh, MSc Urology',
      bio: 'Urologist treating kidney stones, urinary tract conditions, and general urology.',
      experienceYears: 11,
      ratingAvg: '4.5',
      ratingCount: 68,
      clinicKey: 'giza-family-care',
      consultFee: '400.00',
      templates: [
        { weekday: 2, start: '13:00', end: '17:00' },
        { weekday: 0, start: '13:00', end: '17:00' },
      ],
    },
    {
      phone: '+201000000041',
      firstName: 'Hossam',
      lastName: 'Aly',
      specialtyNameEn: 'Endocrinology',
      licenseNumber: 'EG-MED-2013-00112',
      degree: 'MBBCh, MD Endocrinology',
      bio: 'Endocrinologist specializing in diabetes, thyroid disorders, and hormonal health.',
      experienceYears: 14,
      ratingAvg: '4.7',
      ratingCount: 121,
      clinicKey: 'maadi-medical-plaza',
      consultFee: '400.00',
      templates: [
        { weekday: 3, start: '09:00', end: '13:00' },
        { weekday: 6, start: '09:00', end: '13:00' },
      ],
    },
    {
      phone: '+201000000042',
      firstName: 'Mai',
      lastName: 'Reda',
      specialtyNameEn: 'Gastroenterology',
      licenseNumber: 'EG-MED-2015-00113',
      degree: 'MBBCh, MSc Gastroenterology',
      bio: 'Gastroenterologist managing digestive disorders and endoscopic procedures.',
      experienceYears: 10,
      ratingAvg: '4.4',
      ratingCount: 59,
      clinicKey: 'alexandria-medical',
      consultFee: '450.00',
      templates: [
        { weekday: 0, start: '10:00', end: '14:00' },
        { weekday: 2, start: '10:00', end: '14:00' },
      ],
    },
    {
      phone: '+201000000043',
      firstName: 'Amr',
      lastName: 'Nabil',
      specialtyNameEn: 'Pulmonology',
      licenseNumber: 'EG-MED-2012-00114',
      degree: 'MBBCh, MD Pulmonology',
      bio: 'Pulmonologist treating asthma, COPD, and general respiratory conditions.',
      experienceYears: 16,
      ratingAvg: '4.6',
      ratingCount: 103,
      clinicKey: 'cairo-specialized',
      consultFee: '400.00',
      templates: [
        { weekday: 1, start: '13:00', end: '17:00' },
        { weekday: 3, start: '13:00', end: '17:00' },
      ],
    },
    {
      phone: '+201000000044',
      firstName: 'Salma',
      lastName: 'Zaki',
      specialtyNameEn: 'Dentistry',
      licenseNumber: 'EG-DEN-2016-00115',
      degree: 'BDS, MSc Dentistry',
      bio: 'General dentist offering checkups, fillings, and cosmetic dentistry.',
      experienceYears: 9,
      ratingAvg: '4.5',
      ratingCount: 142,
      clinicKey: 'new-cairo-wellness',
      consultFee: '350.00',
      templates: [
        { weekday: 6, start: '09:00', end: '13:00' },
        { weekday: 2, start: '09:00', end: '13:00' },
      ],
    },
    {
      phone: '+201000000045',
      firstName: 'Karim',
      lastName: 'Adly',
      specialtyNameEn: 'Family Medicine',
      licenseNumber: 'EG-MED-2018-00116',
      degree: 'MBBCh',
      bio: 'Family medicine physician for general checkups and everyday health concerns.',
      experienceYears: 6,
      ratingAvg: '4.3',
      ratingCount: 45,
      clinicKey: 'giza-family-care',
      consultFee: '250.00',
      templates: [
        { weekday: 0, start: '09:00', end: '13:00' },
        { weekday: 1, start: '09:00', end: '13:00' },
      ],
    },
  ];

  for (const doc of demoDoctors) {
    const specialty = await prisma.specialty.findUnique({ where: { code: specialtyCode(doc.specialtyNameEn) } });
    const branchId = demoClinicBranchIdByKey.get(doc.clinicKey);
    if (!specialty || !branchId) {
      console.warn(`⚠️ Skipping doctor ${doc.firstName} ${doc.lastName}: missing specialty or clinic branch`);
      continue;
    }

    let user = await prisma.user.findUnique({ where: { phone: doc.phone } });
    if (!user) {
      user = await prisma.user.create({
        data: { phone: doc.phone, first_name: doc.firstName, last_name: doc.lastName },
      });
    }

    let doctor = await prisma.doctor.findUnique({ where: { user_id: user.id } });
    if (!doctor) {
      doctor = await prisma.doctor.create({
        data: {
          user_id: user.id,
          specialty_code: specialty.code,
          license_number: doc.licenseNumber,
          license_verified_at: new Date(),
          status: 'VERIFIED',
          degree: doc.degree,
          bio: doc.bio,
          experience_years: doc.experienceYears,
          rating_avg: doc.ratingAvg,
          rating_count: doc.ratingCount,
          region_code: DEFAULT_REGION,
        },
      });
    }

    let affiliation = await prisma.doctorClinicAffiliation.findFirst({
      where: { doctor_id: doctor.id, clinic_branch_id: branchId },
    });
    if (!affiliation) {
      affiliation = await prisma.doctorClinicAffiliation.create({
        data: {
          doctor_id: doctor.id,
          clinic_branch_id: branchId,
          consult_fee: doc.consultFee,
          currency: 'EGP',
        },
      });
    }

    for (const tpl of doc.templates) {
      const existingTemplate = await prisma.scheduleTemplate.findFirst({
        where: { doctor_clinic_affiliation_id: affiliation.id, weekday: tpl.weekday },
      });
      if (!existingTemplate) {
        await prisma.scheduleTemplate.create({
          data: {
            doctor_clinic_affiliation_id: affiliation.id,
            weekday: tpl.weekday,
            start_time: tpl.start,
            end_time: tpl.end,
            slot_duration_minutes: 20,
            buffer_minutes: 5,
          },
        });
      }
    }
    console.log(`✅ Seeded doctor: Dr. ${doc.firstName} ${doc.lastName} (${doc.specialtyNameEn}) at ${doc.clinicKey}`);
  }
  // Slots aren't generated here — same as the single test doctor above,
  // `HoldExpiryJob`'s sibling `SlotGenerationJob` (worker process cron)
  // rolls a window forward from these ScheduleTemplate rows; run
  // `npm run start:worker:dev` once to populate `appointment_slots` for all
  // of the doctors seeded above.

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
