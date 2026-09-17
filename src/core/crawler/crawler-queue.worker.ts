import { PrismaClient } from '@prisma/client';
import { DARatingEngine } from '@/core/rating/da-rating.engine';
import { RawCompanyRecord, IngestionJobPayload, IngestionSummary } from './crawler.types';

const prisma = new PrismaClient();

export class CrawlerQueueWorker {
  /**
   * Public registry extraction (e.g., Companies House REST API).
   * Generates deterministic records for pipeline verification.
   */
  public static async fetchRegistryBatch(job: IngestionJobPayload): Promise<RawCompanyRecord[]> {
    const timestamp = Date.now().toString().slice(-4);
    return [
      {
        companyName: `Meridian Freight ${timestamp} Ltd`,
        companyNumber: `0987${timestamp}`,
        sicCode: job.targetSicCode,
        contactPhone: `+44770090${timestamp}`,
        contactEmail: `director@meridian${timestamp}.example`,
        declaredTurnover: 650000,
        declaredHeadcount: 6
      },
      {
        companyName: `Apex Courier Services ${timestamp} Ltd`,
        companyNumber: `0876${timestamp}`,
        sicCode: job.targetSicCode,
        // Numbers ending in '99' simulate registered CTPS/TPS entries
        contactPhone: `+44770091${timestamp.slice(0, 2)}99`,
        contactEmail: `dispatch@apex${timestamp}.example`,
        declaredTurnover: 320000,
        declaredHeadcount: 3
      }
    ];
  }

  /**
   * Screens telephone numbers against UK PECR/CTPS rules.
   */
  public static async screenPECR(phone: string): Promise<'PASSED' | 'SUPPRESSED'> {
    // In production, integrate with TPS Services / Provero REST API.
    // Numbers ending in '99' represent registered/suppressed entries.
    if (phone.endsWith('99')) {
      return 'SUPPRESSED';
    }
    return 'PASSED';
  }

  /**
   * Ingestion orchestrator: Extract -> Screen -> Pre-Rate -> Persist
   */
  public static async processIngestionBatch(job: IngestionJobPayload): Promise<IngestionSummary> {
    const records = await this.fetchRegistryBatch(job);
    const facility = await prisma.dABinderFacility.findFirst({
      where: { facilityCode: 'DA-PI-2026' }
    });

    const rateCard = facility 
      ? JSON.parse(facility.rateCardJson) 
      : { baseRate: 0.0045, minimumPremium: 350 };

    let ingestedCount = 0;
    let suppressedCount = 0;
    let failedCount = 0;

    for (const record of records) {
      try {
        const tpsResult = await this.screenPECR(record.contactPhone);
        const isSuppressed = tpsResult === 'SUPPRESSED';

        if (isSuppressed) {
          suppressedCount++;
        } else {
          ingestedCount++;
        }

        const rating = DARatingEngine.calculate(
          {
            annualTurnover: record.declaredTurnover || 500000,
            employeeCount: record.declaredHeadcount || 5,
            sicCode: record.sicCode,
            indemnityLimit: 1000000
          },
          rateCard
        );

        await prisma.diallerQueueItem.upsert({
          where: { companyNumber: record.companyNumber },
          update: {
            tpsStatus: tpsResult,
            tpsCheckedAt: new Date(),
            queueStatus: isSuppressed ? 'EXCLUDED' : 'QUEUED',
            indicativeNet: rating.netPremium,
            indicativeGross: rating.grossPremium
          },
          create: {
            companyName: record.companyName,
            companyNumber: record.companyNumber,
            sicCode: record.sicCode,
            contactPhone: record.contactPhone,
            contactEmail: record.contactEmail,
            estimatedTurnover: record.declaredTurnover || 500000,
            employeeCount: record.declaredHeadcount || 5,
            tpsStatus: tpsResult,
            tpsCheckedAt: new Date(),
            indicativeNet: rating.netPremium,
            indicativeGross: rating.grossPremium,
            queueStatus: isSuppressed ? 'EXCLUDED' : 'QUEUED'
          }
        });
      } catch (err) {
        console.error(`Failed to ingest CRN: ${record.companyNumber}`, err);
        failedCount++;
      }
    }

    return {
      ingested: ingestedCount,
      suppressed: suppressedCount,
      failed: failedCount
    };
  }
}
