export interface RiskIntakePayload {
  annualTurnover: number;
  employeeCount: number;
  sicCode: string;
  indemnityLimit: number;
}

export interface RatingResult {
  netPremium: number;
  iptAmount: number;
  grossPremium: number;
  brokerCommission: number;
  excess: number;
}

export class DARatingEngine {
  private static readonly IPT_RATE = 0.12;
  private static readonly COMMISSION_RATE = 0.15;

  public static calculate(
    payload: RiskIntakePayload,
    rateCard: { baseRate: number; minimumPremium: number }
  ): RatingResult {
    let calculatedNet = payload.annualTurnover * rateCard.baseRate;

    if (payload.employeeCount > 5) {
      calculatedNet += (payload.employeeCount - 5) * 25;
    }

    const netPremium = Math.max(calculatedNet, rateCard.minimumPremium);
    const iptAmount = parseFloat((netPremium * this.IPT_RATE).toFixed(2));
    const grossPremium = parseFloat((netPremium + iptAmount).toFixed(2));
    const brokerCommission = parseFloat((netPremium * this.COMMISSION_RATE).toFixed(2));

    return {
      netPremium: parseFloat(netPremium.toFixed(2)),
      iptAmount,
      grossPremium,
      brokerCommission,
      excess: payload.indemnityLimit >= 2000000 ? 2500 : 1000
    };
  }
}
