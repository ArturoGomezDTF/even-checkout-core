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

/**
 * Tarifa plana: Even 4.0% (Cliente 2.0%, Restaurante 2.0%) para cualquier
 * monto, en todos los servicios.
 */
export function getCommissionRates(_amount: number): CommissionRates {
  return { evenTotal: 4.0, clientPays: 2.0, restaurantPays: 2.0 };
}

export function calculateCommissions(
  baseAmount: number,
  tipAmount: number,
): CommissionBreakdown {
  // IVA de propina (NO pagado por cliente)
  const ivaTip = tipAmount * 0.16;

  // Subtotal para cálculo de comisión Even
  const subtotalForCommission = baseAmount + tipAmount;

  // Obtener tasas según el monto
  const rates = getCommissionRates(subtotalForCommission);

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
