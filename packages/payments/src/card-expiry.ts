/** Años hacia adelante que se ofrecen como vencimiento (cubre tarjetas a ~25-30 años, p. ej. EcartPay vence en 2050). */
export const CARD_EXPIRY_YEARS_AHEAD = 30;

/** Años de vencimiento (2 dígitos, "YY") desde el año de `now` por `count` años. */
export function getCardExpiryYears(
  now: Date = new Date(),
  count: number = CARD_EXPIRY_YEARS_AHEAD,
): string[] {
  const start = now.getFullYear();
  return Array.from({ length: count }, (_, i) => String(start + i).slice(-2));
}
