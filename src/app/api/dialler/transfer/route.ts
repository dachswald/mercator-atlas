import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { DARatingEngine } from '@/core/rating/da-rating.engine';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { leadId, verifiedTurnover, verifiedEmployees, sdrId } = body;

    const lead = await prisma.diallerQueueItem.findUnique({
      where: { id: leadId }
    });

    if (!lead) {
      return NextResponse.json({ error: 'Dialler lead not found' }, { status: 404 });
    }

    const facility = await prisma.dABinderFacility.findFirst({
      where: { facilityCode: 'DA-PI-2026' }
    });

    const rateCard = facility 
      ? JSON.parse(facility.rateCardJson) 
      : { baseRate: 0.0045, minimumPremium: 350 };

    // Re-rate using verified fact-finding inputs
    const updatedRating = DARatingEngine.calculate(
      {
        annualTurnover: verifiedTurnover,
        employeeCount: verifiedEmployees,
        sicCode: lead.sicCode,
        indemnityLimit: 1000000
      },
      rateCard
    );

    // Atomically transition lead to READY_FOR_CLOSER
    const transferredLead = await prisma.diallerQueueItem.update({
      where: { id: leadId },
      data: {
        estimatedTurnover: verifiedTurnover,
        employeeCount: verifiedEmployees,
        indicativeNet: updatedRating.netPremium,
        indicativeGross: updatedRating.grossPremium,
        queueStatus: 'READY_FOR_CLOSER',
        verifiedBySdrId: sdrId || 'sdr-manila-01'
      }
    });

    return NextResponse.json({
      status: 'TRANSFERRED',
      lead: transferredLead
    });
  } catch (error) {
    console.error('Lead transfer failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}