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
