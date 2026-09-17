export interface RawCompanyRecord {
  companyName: string;
  companyNumber: string;
  sicCode: string;
  contactPhone: string;
  contactEmail?: string;
  declaredTurnover?: number;
  declaredHeadcount?: number;
  incorporationDate?: string;
}

export interface IngestionJobPayload {
  targetSicCode: string;
  postalArea?: string;
  batchLimit: number;
}

export interface IngestionSummary {
  ingested: number;
  suppressed: number;
  failed: number;
}
