// Núcleo de comisiones Even (espejo de even-backend/src/utils/commissionCalculator.js).
// Solo para PREVIEW: el backend recalcula y es la autoridad de lo que se cobra.

export interface CommissionRates {
  evenTotal: number; // % total Even
  clientPays: number; // % que paga el cliente
  restaurantPays: number; // % que paga el restaurante
}

export interface CommissionBreakdown {
  // Montos base
  baseAmount: number;
  tipAmount: number;
  ivaTip: number;

  // Subtotal para cálculo de comisiones
  subtotalForCommission: number;

  // Comisiones Even (sin IVA)
  evenCommissionTotal: number;
  evenCommissionClient: number;
  evenCommissionRestaurant: number;

  // IVA sobre comisiones Even
  ivaEvenTotal: number;
  ivaEvenClient: number;
  ivaEvenRestaurant: number;

  // Comisión Even con IVA (lo que realmente se cobra/paga)
  evenClientCharge: number; // Lo que paga el cliente (comisión + IVA)
  evenRestaurantCharge: number; // Lo que paga el restaurante (comisión + IVA)

  // Total cobrado al cliente
  totalAmountCharged: number;

  // Metadata
  rates: CommissionRates;
}

/** Identificadores de servicio (mismos que `service` en even-backend). */
export type CommissionService =
  | "pick-and-go"
  | "room-service"
  | "tap-order-and-pay"
  | "tap-and-pay"
  | "flex-bill";

/** Tarifa por defecto: Even 4% = 2% cliente + 2% restaurante. */
export const DEFAULT_COMMISSION_RATES: CommissionRates = {
  evenTotal: 4.0,
  clientPays: 2.0,
  restaurantPays: 2.0,
};

/** El restaurante paga el 4% completo; el cliente no ve ninguna comisión. */
const SOLO_RESTAURANTE: CommissionRates = {
  evenTotal: 4.0,
  clientPays: 0,
  restaurantPays: 4.0,
};

/**
 * Reparto por servicio. Un servicio que no está aquí (Pick & Go, Room Service)
 * usa DEFAULT_COMMISSION_RATES. Espejo de SERVICE_COMMISSION_RATES en
 * even-backend/src/utils/commissionCalculator.js; ver docs/comisiones.md.
 */
export const SERVICE_COMMISSION_RATES: Partial<
  Record<CommissionService, CommissionRates>
> = {
  "tap-order-and-pay": SOLO_RESTAURANTE,
  "flex-bill": SOLO_RESTAURANTE,
  "tap-and-pay": SOLO_RESTAURANTE,
};

// Alias que acepta el backend para el mismo servicio.
const SERVICE_ALIASES: Record<string, CommissionService> = {
  "tap-order-pay": "tap-order-and-pay",
  tap_order_and_pay: "tap-order-and-pay",
  flexbill: "flex-bill",
  flex_bill: "flex-bill",
  "tap-pay": "tap-and-pay",
  tap_and_pay: "tap-and-pay",
  tap_pay: "tap-and-pay",
};

function normalizeService(service?: string | null): string | null {
  if (typeof service !== "string") return null;
  const s = service.trim().toLowerCase();
  return SERVICE_ALIASES[s] ?? (s || null);
}

/**
 * Tarifa plana Even 4% para cualquier monto. El reparto cliente/restaurante
 * depende del servicio (2/2 por defecto; 0/4 en Tap Order & Pay, FlexBill y
 * Tap & Pay). `_amount` se conserva por compatibilidad con los callers.
 */
export function getCommissionRates(
  _amount: number,
  service?: string | null,
): CommissionRates {
  const key = normalizeService(service) as CommissionService | null;
  const rates = (key && SERVICE_COMMISSION_RATES[key]) || DEFAULT_COMMISSION_RATES;
  return { ...rates };
}

export function calculateCommissions(
  baseAmount: number,
  tipAmount: number,
  service?: string | null,
): CommissionBreakdown {
  // IVA de propina (NO pagado por cliente)
  const ivaTip = tipAmount * 0.16;

  // Subtotal para cálculo de comisión Even
  const subtotalForCommission = baseAmount + tipAmount;

  // Obtener tasas según el monto
  const rates = getCommissionRates(subtotalForCommission, service);

  // Comisiones Even (sin IVA)
  const evenCommissionTotal = subtotalForCommission * (rates.evenTotal / 100);
  const evenCommissionClient = subtotalForCommission * (rates.clientPays / 100);
  const evenCommissionRestaurant =
    subtotalForCommission * (rates.restaurantPays / 100);

  // IVA sobre comisiones Even (16%)
  const ivaEvenTotal = evenCommissionTotal * 0.16;
  const ivaEvenClient = evenCommissionClient * 0.16;
  const ivaEvenRestaurant = evenCommissionRestaurant * 0.16;

  const r2 = (n: number) => Math.round(n * 100) / 100;

  // Comisión Even con IVA incluido
  const evenClientCharge = r2(evenCommissionClient + ivaEvenClient);
  const evenRestaurantCharge = r2(evenCommissionRestaurant + ivaEvenRestaurant);

  // Total cobrado al cliente
  const totalAmountCharged = r2(baseAmount + tipAmount + evenClientCharge);

  return {
    baseAmount,
    tipAmount,
    ivaTip,
    subtotalForCommission,
    evenCommissionTotal,
    evenCommissionClient,
    evenCommissionRestaurant,
    ivaEvenTotal,
    ivaEvenClient,
    ivaEvenRestaurant,
    evenClientCharge,
    evenRestaurantCharge,
    totalAmountCharged,
    rates,
  };
}

export function formatMXN(amount: number): string {
  return `$${amount.toFixed(2)} MXN`;
}
