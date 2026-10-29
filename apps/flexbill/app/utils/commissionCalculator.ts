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

// CONVENCIÓN DE COMISIÓN POR SERVICIO (solo comentarios; léelo antes de tocar
// montos en pantalla).
//
// FlexBill (igual que Tap Order & Pay) NO muestra la comisión del cliente
// (2% + IVA) como línea aparte: va incrustada en el precio de cada platillo
// (getItemDisplayPrice / getDisplaySubtotal) y en la Propina que ve el
// comensal. Pick & Go es el que la muestra aparte. Tabla completa en
// even-backend/src/utils/commissionCalculator.js.
//
//  - `price` real nunca se infla ni se manda inflado al backend: lo que se
//    cobra es base + propina real + comisión, recalculado en el servidor.
//  - Al POS (PoloTab) viaja base_amount + tip_amount del abono, nunca el
//    precio inflado ni la comisión. Por eso la propina mostrada puede diferir
//    unos centavos de la del POS: la diferencia es la comisión de esa propina.
//  - Subtotal + Propina mostrados deben sumar siempre el Total.

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

// ============================================================
// Comisión por ítem — espejo de even-backend/src/utils/commissionCalculator.js.
// Solo para PREVIEW visual (mostrar un número antes de pagar) — el backend
// recalcula todo desde los dish_order reales al crear la transacción, así
// que esto nunca es la autoridad de cuánto se cobra.
// ============================================================

export interface ItemCommissionRate {
  clientPays: number;
  restaurantPays: number;
}

// Tarifa fija — antes había un tramo de 2.2% para ítems <=$40 (unitPrice se
// mantiene como parámetro por compatibilidad con los callers, aunque ya no
// se use).
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

export interface FlexBillCommissionLineItem {
  price: number;
  extraPrice?: number;
  quantity: number;
}

function computeItemCommissionTotals(items: FlexBillCommissionLineItem[]) {
  let baseAmount = 0;
  let evenCommissionClient = 0;
  let evenCommissionRestaurant = 0;

  for (const item of items) {
    const quantity = item.quantity || 1;
    const unitPrice = item.price + (item.extraPrice || 0);
    const rate = getItemCommissionRate(unitPrice);
    const lineBase = unitPrice * quantity;

    baseAmount += lineBase;
    evenCommissionClient += lineBase * (rate.clientPays / 100);
    evenCommissionRestaurant += lineBase * (rate.restaurantPays / 100);
  }

  return { baseAmount, evenCommissionClient, evenCommissionRestaurant };
}

function finalizeItemCommission(
  totals: {
    baseAmount: number;
    evenCommissionClient: number;
    evenCommissionRestaurant: number;
  },
  tipAmount: number,
): CommissionBreakdown {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const { baseAmount, evenCommissionClient, evenCommissionRestaurant } =
    totals;

  // La tasa % de cada ítem se determinó por su propio precio (arriba), pero
  // el monto en pesos se cobra sobre consumo + propina — igual que el
  // modelo viejo — usando el promedio ponderado que resultó de tarifar cada
  // ítem individualmente, no una tasa fija por subtotal.
  const blendedClientRate = baseAmount > 0 ? evenCommissionClient / baseAmount : 0;
  const blendedRestaurantRate =
    baseAmount > 0 ? evenCommissionRestaurant / baseAmount : 0.02;

  const subtotalForCommission = baseAmount + tipAmount;
  const finalCommissionClient = subtotalForCommission * blendedClientRate;
  const finalCommissionRestaurant =
    subtotalForCommission * blendedRestaurantRate;

  const evenCommissionTotal = finalCommissionClient + finalCommissionRestaurant;
  const ivaEvenClient = finalCommissionClient * 0.16;
  const ivaEvenRestaurant = finalCommissionRestaurant * 0.16;
  const ivaTip = tipAmount * 0.16;

  const evenClientCharge = r2(finalCommissionClient + ivaEvenClient);
  const evenRestaurantCharge = r2(
    finalCommissionRestaurant + ivaEvenRestaurant,
  );
  const totalAmountCharged = r2(baseAmount + tipAmount + evenClientCharge);
  const evenRateApplied =
    subtotalForCommission > 0
      ? (evenCommissionTotal / subtotalForCommission) * 100
      : 0;

  return {
    baseAmount: r2(baseAmount),
    tipAmount: r2(tipAmount),
    ivaTip,
    subtotalForCommission: r2(subtotalForCommission),
    evenCommissionTotal,
    evenCommissionClient: finalCommissionClient,
    evenCommissionRestaurant: finalCommissionRestaurant,
    ivaEvenTotal: evenCommissionTotal * 0.16,
    ivaEvenClient,
    ivaEvenRestaurant,
    evenClientCharge,
    evenRestaurantCharge,
    totalAmountCharged,
    rates: {
      evenTotal: evenRateApplied,
      clientPays: blendedClientRate * 100,
      restaurantPays: blendedRestaurantRate * 100,
    },
  };
}

// full-bill / select-items: ítems exactos conocidos.
export function calculateFlexBillItemCommission(
  items: FlexBillCommissionLineItem[],
  tipAmount: number,
): CommissionBreakdown {
  return finalizeItemCommission(computeItemCommissionTotals(items), tipAmount);
}

// equal-shares / choose-amount: fracción del total real de la mesa.
export function calculateFlexBillProportionalCommission(
  items: FlexBillCommissionLineItem[],
  fraction: number,
  tipAmount: number,
): CommissionBreakdown {
  const totals = computeItemCommissionTotals(items);
  return finalizeItemCommission(
    {
      baseAmount: totals.baseAmount * fraction,
      evenCommissionClient: totals.evenCommissionClient * fraction,
      evenCommissionRestaurant: totals.evenCommissionRestaurant * fraction,
    },
    tipAmount,
  );
}

// Subtotal fijo a mostrar: consumo + su propia comisión, redondeando POR
// ÍTEM (precio × cantidad, cada línea redondeada) y sumando — el mismo
// método que ya usa el backend para total_display_price (ver
// flexBillService.js/kitchenService.js). Sumar dos totales ya redondeados
// por separado (base + comisión) puede dar un centavo distinto a este
// método; por eso se calcula directo desde los ítems reales, no desde un
// CommissionBreakdown ya redondeado.
export function getDisplaySubtotal(items: FlexBillCommissionLineItem[]): number {
  let total = 0;
  for (const item of items) {
    const unitPrice = item.price + (item.extraPrice || 0);
    const displayPrice = getItemDisplayPrice(unitPrice);
    total += Math.round(displayPrice * (item.quantity || 1) * 100) / 100;
  }
  return Math.round(total * 100) / 100;
}

// Igual que getDisplaySubtotal, pero para pagos que representan una
// fracción de la mesa (equal-shares/choose-amount) — no hay ítems propios
// que redondear uno por uno, así que se aplica la fracción sobre el
// subtotal ya correctamente redondeado de TODOS los ítems de la mesa.
export function getDisplaySubtotalForFraction(
  allTableItems: FlexBillCommissionLineItem[],
  fraction: number,
): number {
  return Math.round(getDisplaySubtotal(allTableItems) * fraction * 100) / 100;
}

// Dado un monto que el cliente quiere ver como "Propina" (ya con su propia
// comisión incrustada — ej. tecleó $50 y quiere ver exactamente $50, o eligió
// 10% del subtotal), resuelve qué propina real hay que mandar al cálculo de
// comisión para que Total - Subtotal fijo cierre exacto contra ese monto.
// `computeBreakdown` es la misma función que ya arma el breakdown real según
// el tipo de pago (full-bill/select-items/equal-shares/choose-amount) — se
// reutiliza tal cual, sin duplicar esa lógica aquí.
export function resolveTipAmountForTargetDisplay(
  computeBreakdown: (tipAmount: number) => CommissionBreakdown,
  displaySubtotal: number,
  targetDisplayPropina: number,
): number {
  if (targetDisplayPropina <= 0) return 0;

  const zeroTip = computeBreakdown(0);
  const blendedClientRate =
    zeroTip.baseAmount > 0
      ? zeroTip.evenCommissionClient / zeroTip.baseAmount
      : 0;
  const factor = 1 + blendedClientRate * 1.16;

  let tipAmount = factor > 0 ? targetDisplayPropina / factor : targetDisplayPropina;
  tipAmount = Math.max(Math.round(tipAmount * 100) / 100, 0);

  // Corrección por redondeo — el residuo (Total - Subtotal) puede quedar a
  // un centavo del objetivo por los redondeos intermedios del breakdown;
  // esto converge en 1-2 vueltas dado que la relación es casi lineal.
  for (let i = 0; i < 3; i++) {
    const breakdown = computeBreakdown(tipAmount);
    const displayPropina =
      Math.round((breakdown.totalAmountCharged - displaySubtotal) * 100) /
      100;
    const diff =
      Math.round((targetDisplayPropina - displayPropina) * 100) / 100;
    if (diff === 0) break;
    tipAmount = Math.max(Math.round((tipAmount + diff) * 100) / 100, 0);
  }

  return tipAmount;
}
