import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { DARatingEngine } from '@/core/rating/da-rating.engine';
import { CassiniDocumentAdapter } from '@/adapters/documents/cassini-document.adapter';

const prisma = new PrismaClient();
const documentAdapter = new CassiniDocumentAdapter();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { brokerId, smeId, facilityId, indemnityLimit = 1000000 } = body;

    // 1. Resolve domain entities using primary keys or unique identifiers
    const [broker, facility] = await Promise.all([
      prisma.broker.findFirst({
        where: { OR: [{ id: brokerId }, { email: brokerId }] }
      }),
      prisma.dABinderFacility.findFirst({
        where: { OR: [{ id: facilityId }, { facilityCode: facilityId }] }
      })
    ]);

    if (!broker || !facility) {
      return NextResponse.json(
        { error: 'Broker or Binder Facility resolution failed. Seed data missing.' },
        { status: 404 }
      );
    }

    // 2. Resolve SME from ClientSME table, or promote directly from DiallerQueueItem
    let sme = await prisma.clientSME.findFirst({
      where: { OR: [{ id: smeId }, { companyNumber: smeId }] }
    });

    if (!sme) {
      const queuedLead = await prisma.diallerQueueItem.findUnique({
        where: { companyNumber: smeId }
      });

      if (!queuedLead) {
        return NextResponse.json(
          { error: `No registered or queued entity found for ID: ${smeId}` },
          { status: 404 }
        );
      }

      sme = await prisma.clientSME.create({
        data: {
          companyName: queuedLead.companyName,
          companyNumber: queuedLead.companyNumber,
          annualTurnover: queuedLead.estimatedTurnover,
          employeeCount: queuedLead.employeeCount,
          sicCode: queuedLead.sicCode
        }
      });
    }

    // 3. Deterministic rating calculation
    const rateCard = JSON.parse(facility.rateCardJson);
    const rating = DARatingEngine.calculate(
      {
        annualTurnover: sme.annualTurnover,
        employeeCount: sme.employeeCount,
        sicCode: sme.sicCode,
        indemnityLimit
      },
      rateCard
    );

    if (facility.remainingCapacity < rating.grossPremium) {
      return NextResponse.json({ error: 'Capacity ceiling reached' }, { status: 400 });
    }

    // 4. Generate policy identifiers and term dates
    const policyNumber = `POL-${Date.now().toString().slice(-6)}`;
    const effectiveFrom = new Date();
    const effectiveTo = new Date();
    effectiveTo.setFullYear(effectiveTo.getFullYear() + 1);

    // 5. Atomic transaction: create policy, decrement capacity, mark queue item CONVERTED
    await prisma.$transaction([
      prisma.policyTransaction.create({
        data: {
          policyNumber,
          facilityId: facility.id,
          brokerId: broker.id,
          smeId: sme.id,
          status: 'BOUND',
          netPremium: rating.netPremium,
          iptAmount: rating.iptAmount,
          grossPremium: rating.grossPremium,
          brokerCommission: rating.brokerCommission,
          riskDetailsSnapshot: JSON.stringify({
            turnover: sme.annualTurnover,
            employees: sme.employeeCount,
            indemnityLimit
          }),
          boundAt: new Date()
        }
      }),
      prisma.dABinderFacility.update({
        where: { id: facility.id },
        data: { remainingCapacity: facility.remainingCapacity - rating.grossPremium }
      }),
      prisma.diallerQueueItem.updateMany({
        where: { companyNumber: sme.companyNumber },
        data: { queueStatus: 'CONVERTED' }
      })
    ]);

    // 6. Render schedule PDF via document engine
    const pdfBuffer = await documentAdapter.generatePolicySchedule({
      policyNumber,
      facilityCode: facility.facilityCode,
      smeName: sme.companyName,
      companyNumber: sme.companyNumber,
      effectiveFrom: effectiveFrom.toISOString().split('T')[0],
      effectiveTo: effectiveTo.toISOString().split('T')[0],
      grossPremium: rating.grossPremium,
      ipt: rating.iptAmount,
      netPremium: rating.netPremium,
      indemnityLimit,
      excess: rating.excess
    });

    // 7. Cast Buffer to Uint8Array for Web Response compatibility
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${policyNumber}-schedule.pdf"`
      }
    });
  } catch (error) {
    console.error('Failed to bind policy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}