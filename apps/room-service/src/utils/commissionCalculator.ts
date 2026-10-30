import {
  calculateCommissions,
  formatMXN,
  getCommissionRates,
  type CommissionBreakdown,
  type CommissionRates,
} from "@even/payments";

// Núcleo compartido en @even/payments; se re-exporta para no tocar a los callers.
export {
  calculateCommissions,
  formatMXN,
  getCommissionRates,
  type CommissionBreakdown,
  type CommissionRates,
};

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
  return { clientPays: 2.0, restaurantPays: 2.0 };
}

// Precio que ve el cliente: precio real + comisión del cliente + IVA sobre
// esa comisión, ya incrustados.
export function getItemDisplayPrice(unitPrice: number): number {
  const rate = getItemCommissionRate(unitPrice);
  const commission = unitPrice * (rate.clientPays / 100);
  const iva = commission * 0.16;
  return Math.round((unitPrice + commission + iva) * 100) / 100;
}
