import {
  calculateCommissions as calculateServiceCommissions,
  formatMXN,
  getCommissionRates as getServiceCommissionRates,
  type CommissionBreakdown,
  type CommissionRates,
} from "@even/payments";

// Reparto de comisión de Tap & Pay: 4% restaurante, el cliente no paga comisión.
// Tabla completa y reglas en docs/comisiones.md. El backend es la autoridad.
export const COMMISSION_SERVICE = "tap-and-pay" as const;

export { formatMXN, type CommissionBreakdown, type CommissionRates };

export function getCommissionRates(amount: number): CommissionRates {
  return getServiceCommissionRates(amount, COMMISSION_SERVICE);
}

export function calculateCommissions(
  baseAmount: number,
  tipAmount: number,
): CommissionBreakdown {
  return calculateServiceCommissions(baseAmount, tipAmount, COMMISSION_SERVICE);
}
