import { prisma } from './client';

async function main() {
  console.log('🌱 Starting database seed verification...');

  // Seed default policy config
  const cancellationPolicy = await prisma.policyConfig.upsert({
    where: { key: 'CANCELLATION_FEE_PERCENT' },
    update: {},
    create: {
      key: 'CANCELLATION_FEE_PERCENT',
      value: '10',
      description: 'Default platform fee percentage charged on appointment cancellation',
    },
  });

  console.log(`✅ Seeded policy config: ${cancellationPolicy.key} = ${cancellationPolicy.value}%`);

  // Seed baseline specialties
  const specialtiesData = [
    { nameEn: 'General Practice', nameAr: 'طب عام', description: 'General health services' },
    { nameEn: 'Cardiology', nameAr: 'أمراض القلب', description: 'Heart and cardiovascular care' },
    { nameEn: 'Dermatology', nameAr: 'أمراض الجلدية', description: 'Skin, hair, and nail treatments' },
    { nameEn: 'Pediatrics', nameAr: 'طب الأطفال', description: 'Infant and child healthcare' },
  ];

  for (const spec of specialtiesData) {
    const existing = await prisma.specialty.findFirst({
      where: { nameEn: spec.nameEn },
    });

    if (!existing) {
      const created = await prisma.specialty.create({
        data: spec,
      });
      console.log(`✅ Seeded specialty: ${created.nameEn} / ${created.nameAr}`);
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
