export interface DemandsAndNeedsPayload {
  companyName: string;
  companyNumber: string;
  sicCode: string;
  indemnityLimit: number;
  excess: number;
  declaredTurnover: number;
  employeeCount: number;
}

export interface DemandsAndNeedsStatement {
  statementId: string;
  generatedAt: string;
  basisOfAdvice: 'NON_ADVISED_DIRECT_FACILITY';
  targetFacility: string;
  customerDemands: string[];
  assessedNeeds: string[];
  statutoryNotice: string;
}

export class IDDComplianceEngine {
  public static evaluate(payload: DemandsAndNeedsPayload): DemandsAndNeedsStatement {
    const timestamp = new Date().toISOString();
    const statementId = `DN-${Date.now().toString().slice(-6)}`;

    const customerDemands = [
      `Commercial Professional Indemnity coverage for UK operations under SIC ${payload.sicCode}.`,
      `Financial protection against third-party civil liability, negligent acts, errors, or omissions.`,
      `Statutory compliance with client contractual minimum indemnity requirements (£${payload.indemnityLimit.toLocaleString()}).`
    ];

    const assessedNeeds = [
      `Primary coverage limit of £${payload.indemnityLimit.toLocaleString()} in the aggregate including legal defence costs.`,
      `Excess threshold fixed at £${payload.excess.toLocaleString()} per claim, commensurate with an annual turnover of £${payload.declaredTurnover.toLocaleString()}.`,
      `Immediate straight-through certificate issuance via Delegated Authority facility DA-PI-2026.`
    ];

    const statutoryNotice =
      'This transaction is concluded on a non-advised basis under European Insurance Distribution Directive (IDD) and FCA ICOBS standards. Mercator-Atlas acts as a coverholder for the capacity provider and does not conduct a whole-of-market assessment.';

    return {
      statementId,
      generatedAt: timestamp,
      basisOfAdvice: 'NON_ADVISED_DIRECT_FACILITY',
      targetFacility: 'DA-PI-2026',
      customerDemands,
      assessedNeeds,
      statutoryNotice
    };
  }
}