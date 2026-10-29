// Código de un QR de "promo exclusiva" (TK: activación con QR exclusivo):
// se lee una sola vez de la URL (?promo=) al entrar y se cachea en
// localStorage por restaurante+sucursal — mismo patrón que el session token
// de mesa de FlexBill, así el desbloqueo sobrevive la navegación entre
// menu/carrito/checkout sin tener que ir en cada URL.
const storageKey = (restaurantId: number, branchNumber: number) =>
  `even-promo-code-${restaurantId}-${branchNumber}`;

export function getStoredPromoCode(
  restaurantId: number | null,
  branchNumber: number | null,
): string | null {
  if (typeof window === "undefined" || !restaurantId || !branchNumber) {
    return null;
  }
  return localStorage.getItem(storageKey(restaurantId, branchNumber));
}

export function storePromoCode(
  restaurantId: number,
  branchNumber: number,
  code: string,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(restaurantId, branchNumber), code);
}
