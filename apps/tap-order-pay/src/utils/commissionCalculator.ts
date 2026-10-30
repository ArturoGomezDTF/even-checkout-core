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
// CONVENCIÓN DE COMISIÓN POR SERVICIO (léelo antes de tocar montos en pantalla)
//
// En Tap Order & Pay (igual que FlexBill) la comisión del cliente (2% + IVA)
// NO se muestra como línea aparte: va incrustada en el precio de cada platillo
// (getItemDisplayPrice) y en la Propina que ve el comensal. Pick & Go sí la
// muestra aparte ("Cobro por servicio"); no copiar esa línea aquí. Se decidió
// así en #31 y se ratificó en #56.
//
// DECISIÓN (#56): la propina que ve el comensal incluye su comisión, y la
// propina que se manda al backend/POS es la que queda DESCONTANDO esa comisión
// de lo que se muestra. La propina NO se infla hacia el POS.
//   Ejemplo, consumo $85 (subtotal inflado $86.97), el comensal teclea "Otro" $50:
//     - Pantalla: Propina $50.00 -> Total $136.97
//     - POS / backend (tipAmount): $48.86 (= 50 / 1.0232, comisión descontada)
//     - Comisión de la propina: $1.14, que cobra Even, no se manda al POS.
//   Con 10% sobre $85: pantalla $8.70, al POS $8.50, Total $95.67.
// Por eso resolveTipAmountForTargetDisplay (abajo) despeja la propina real a
// partir de la que se quiere mostrar. Una versión intermedia de #56 mandaba la
// propina tecleada tal cual ($50 al POS, pantalla $51.16); el equipo decidió
// revertirla para no inflar lo que llega al POS.
//
//  - Lo que se COBRA y se REGISTRA: baseAmount (consumo real), tipAmount (el
//    despejado) y la comisión por separado. El backend recalcula todo desde el
//    carrito (even-backend montoDeCobro).
//  - Al POS (PoloTab o cualquier otro) viaja base + tipAmount; nunca el precio
//    inflado ni la comisión. La "Propina" mostrada puede diferir de la del POS:
//    la diferencia es la comisión de esa propina.
//  - Nunca mandar al backend un monto "de pantalla" (inflado) como baseAmount
//    o tipAmount: se contaría la comisión dos veces.
//  - Subtotal + Propina mostrados deben sumar siempre el Total: cualquier
//    pantalla que desglose un pago usa getDisplaySubtotal + getDisplayTip.
// ============================================================

// ============================================================
// Precio inflado por ítem — mismo mecanismo que even-flexbill. Tap Order &
// Pay no tiene pago parcial (siempre se ordena y paga el carrito completo),
// así que a diferencia de Flex Bill no hace falta portar las variantes por
// fracción/subconjunto de ítems — solo lo que aplica a "todo el carrito".
// Solo para PREVIEW visual (mostrar un número antes de pagar) — el backend
// recalcula todo desde los dish_order reales al crear la transacción, así
// que esto nunca es la autoridad de cuánto se cobra.
// ============================================================

export interface ItemCommissionRate {
  clientPays: number;
  restaurantPays: number;
}

// Tarifa fija — igual que getCommissionRates de arriba, separada porque el
// backend la expone como una función propia (getItemCommissionRate).
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

export interface ItemDisplayLineItem {
  price: number;
  extraPrice?: number;
  quantity: number;
}

// Subtotal fijo a mostrar: consumo + su propia comisión, redondeando POR
// ÍTEM (precio × cantidad, cada línea redondeada) y sumando — sumar dos
// totales ya redondeados por separado (base + comisión) puede dar un
// centavo distinto a este método; por eso se calcula directo desde los
// ítems reales. Mismo método que even-flexbill/app/utils/commissionCalculator.ts.
export function getDisplaySubtotal(items: ItemDisplayLineItem[]): number {
  let total = 0;
  for (const item of items) {
    const unitPrice = item.price + (item.extraPrice || 0);
    const displayPrice = getItemDisplayPrice(unitPrice);
    total += Math.round(displayPrice * (item.quantity || 1) * 100) / 100;
  }
  return Math.round(total * 100) / 100;
}

// Propina que ve el comensal: lo que le falta al Subtotal inflado (ya con su
// propia comisión) para llegar al Total cobrado. Incluye la comisión que genera
// la propina (y, en card-selection, el costo de MSI si aplica); no es el
// `tipAmount` real que se cobra y se registra en el POS. Ver convención arriba.
export function getDisplayTip(
  totalAmount: number,
  displaySubtotal: number,
): number {
  return Math.round((totalAmount - displaySubtotal) * 100) / 100;
}

// Dado un monto que el cliente quiere ver como "Propina" (ya con su propia
// comisión incrustada — ej. tecleó $50 y quiere ver exactamente $50, o eligió
// 10% del subtotal), resuelve qué propina real hay que mandar al cálculo de
// comisión para que Total - Subtotal fijo cierre exacto contra ese monto.
// `computeBreakdown` es la función que arma el breakdown real de comisión
// para una propina dada (acá, calculateCommissions por total — no hay
// variante por ítem porque no hay pago parcial en este flujo).
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
