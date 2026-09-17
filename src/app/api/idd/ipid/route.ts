import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { IDDComplianceEngine } from '@/core/idd/idd-compliance.engine';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { companyNumber, indemnityLimit = 1000000 } = body;

    const lead = await prisma.diallerQueueItem.findUnique({
      where: { companyNumber }
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found in dialler queue' }, { status: 404 });
    }

    const excess = indemnityLimit >= 2000000 ? 2500 : 1000;
    const demandsStatement = IDDComplianceEngine.evaluate({
      companyName: lead.companyName,
      companyNumber: lead.companyNumber,
      sicCode: lead.sicCode,
      indemnityLimit,
      excess,
      declaredTurnover: lead.estimatedTurnover,
      employeeCount: lead.employeeCount
    });

    const accessKey = `IPID-${Date.now().toString().slice(-8)}`;

    const updatedLead = await prisma.diallerQueueItem.update({
      where: { companyNumber },
      data: {
        ipidAccessKey: accessKey,
        ipidDeliveredAt: new Date()
      }
    });

    return NextResponse.json({
      status: 'DELIVERED',
      accessKey,
      deliveredAt: updatedLead.ipidDeliveredAt,
      durableUrl: `http://localhost:3000/api/idd/view?key=${accessKey}`,
      demandsStatement
    });
  } catch (error) {
    console.error('IPID delivery failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
