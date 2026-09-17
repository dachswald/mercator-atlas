import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const lead = await prisma.$transaction(async (tx) => {
      const candidate = await tx.diallerQueueItem.findFirst({
        where: { queueStatus: 'READY_FOR_CLOSER' },
        orderBy: { updatedAt: 'asc' }
      });

      if (!candidate) return null;

      return await tx.diallerQueueItem.update({
        where: { id: candidate.id },
        data: { queueStatus: 'CLOSER_ENGAGED' }
      });
    });

    if (!lead) {
      return NextResponse.json(
        { message: 'No warm leads pending transfer from SDR floor.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'ACCEPTED',
      lead
    });
  } catch (error) {
    console.error('Closer claim failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
