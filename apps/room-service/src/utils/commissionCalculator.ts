import {
  calculateCommissions as calculateServiceCommissions,
  formatMXN,
  getCommissionRates as getServiceCommissionRates,
  type CommissionBreakdown,
  type CommissionRates,
} from "@even/payments";

// Reparto de comisión de Room Service: 2% restaurante + 2% cliente (comisión de servicio visible).
// Tabla completa y reglas en docs/comisiones.md. El backend es la autoridad.
export const COMMISSION_SERVICE = "room-service" as const;

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

// ============================================================
// Comisión por ítem — espejo de even-backend/src/utils/commissionCalculator.js.
// Room Service no infla el precio mostrado con su propio modelo, pero el
// historial es compartido entre servicios y puede mostrar órdenes de Tap
// Order & Pay / Flex Bill, que sí lo hacen — ver HistoryTab.tsx.
// ============================================================

export interface ItemCommissionRate {
  clientPays: number;
  restaurantPays: number;
}

export function getItemCommissionRate(
  _unitPrice: number,
): ItemCommissionRate {
  const { clientPays, restaurantPays } = getCommissionRates(0);
  return { clientPays, restaurantPays };
}

// Precio que ve el cliente: precio real + comisión del cliente + IVA sobre
// esa comisión, ya incrustados.
export function getItemDisplayPrice(unitPrice: number): number {
  const rate = getItemCommissionRate(unitPrice);
  const commission = unitPrice * (rate.clientPays / 100);
  const iva = commission * 0.16;
  return Math.round((unitPrice + commission + iva) * 100) / 100;
}
