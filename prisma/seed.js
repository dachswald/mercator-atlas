const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.policyTransaction.deleteMany();
  await prisma.diallerQueueItem.deleteMany();
  await prisma.clientSME.deleteMany();
  await prisma.broker.deleteMany();
  await prisma.dABinderFacility.deleteMany();

  const broker = await prisma.broker.create({
    data: {
      id: 'broker-demo-01',
      name: 'Eleanor Vance',
      email: 'eleanor.vance@mercator-atlas.example'
    }
  });

  const sme = await prisma.clientSME.create({
    data: {
      id: 'sme-demo-01',
      companyName: 'Apex Logistics Ltd',
      companyNumber: '12345678',
      annualTurnover: 750000,
      employeeCount: 8,
      sicCode: '49410'
    }
  });

  const facility = await prisma.dABinderFacility.create({
    data: {
      id: 'facility-da-01',
      facilityCode: 'DA-PI-2026',
      totalCapacity: 5000000,
      remainingCapacity: 5000000,
      rateCardJson: JSON.stringify({
        baseRate: 0.0045,
        minimumPremium: 350
      })
    }
  });

  console.log('Database seeded successfully:');
  console.log({ brokerId: broker.id, smeId: sme.id, facilityCode: facility.facilityCode });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  