import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'QUEUED';

    const leads = await prisma.diallerQueueItem.findMany({
      where: {
        queueStatus: status,
        tpsStatus: 'PASSED'
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return NextResponse.json({
      count: leads.length,
      leads
    });
  } catch (error) {
    console.error('Failed to fetch dialler queue:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
