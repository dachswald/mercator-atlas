import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const facilityCode = searchParams.get('facility') || 'DA-PI-2026';

    const facility = await prisma.dABinderFacility.findUnique({
      where: { facilityCode }
    });

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
    }

    const policies = await prisma.policyTransaction.findMany({
      where: { facilityId: facility.id },
      include: {
        sme: true,
        broker: true
      },
      orderBy: { boundAt: 'asc' }
    });

    // Generate CSV Header
    const headers = [
      'PolicyNumber',
      'FacilityCode',
      'InsuredName',
      'CompanyNumber',
      'SICCode',
      'NetPremium',
      'IPT',
      'GrossPremium',
      'BrokerCommission',
      'BoundDate',
      'BrokerEmail'
    ];

    const rows = policies.map((p) => [
      p.policyNumber,
      facility.facilityCode,
      `"${p.sme.companyName.replace(/"/g, '""')}"`,
      p.sme.companyNumber,
      p.sme.sicCode,
      p.netPremium.toFixed(2),
      p.iptAmount.toFixed(2),
      p.grossPremium.toFixed(2),
      p.brokerCommission.toFixed(2),
      p.boundAt.toISOString(),
      p.broker.email
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="Bordereau-${facilityCode}-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  } catch (error) {
    console.error('Failed to export bordereau:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
