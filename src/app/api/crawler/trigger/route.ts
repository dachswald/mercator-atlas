import { NextResponse } from 'next/server';
import { CrawlerQueueWorker } from '@/core/crawler/crawler-queue.worker';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { targetSicCode = '49410', batchLimit = 20 } = body;

    const summary = await CrawlerQueueWorker.processIngestionBatch({
      targetSicCode,
      batchLimit
    });

    return NextResponse.json({
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
      summary
    });
  } catch (error) {
    console.error('Crawler execution failed:', error);
    return NextResponse.json(
      { error: 'Internal Server Error during ingestion' },
      { status: 500 }
    );
  }
}
