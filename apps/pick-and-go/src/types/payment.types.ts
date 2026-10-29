/**
 * Tipos relacionados con pagos y métodos de pago
 */

export interface PaymentMethod {
  id: string;
  lastFourDigits: string;
  cardType: string;
  cardBrand: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  isDefault: boolean;
  createdAt: string;
}

export interface AddPaymentMethodRequest {
  fullName: string;
  //email: string;
  cardNumber: string;
  expDate: string;
  cvv: string;
}

export interface CartItemForPayment {
  name: string;
  price: number;
  quantity: number;
  extraPrice?: number;
  // even-backend #333: identificador de la fila de cart_items. Deja que el
  // servidor recalcule el consumo desde el carrito —donde el precio ya está
  // resuelto contra el menú, las promociones y los descuentos personales— en
  // vez de confiar en el total que manda este cliente. Opcional en el backend.
  cartItemId?: string | null;
}

export interface ProcessPaymentRequest {
  paymentMethodId: string;
  amount: number;
  currency?: string;
  description?: string;
  orderId?: string;
  tableNumber?: string;
  restaurantId?: string;
  installments?: number;
  baseAmount?: number;
  tipAmount?: number;
  items?: CartItemForPayment[];
  // TK-0078: descuento personal "% en la cuenta" — el backend valida y
  // consume su único uso antes de cobrar (y lo revierte si el cobro falla)
  userDiscountId?: string;
  // Promo QR "% en la cuenta" — mismo mecanismo, origen distinto
  // (promo_redemptions). Nunca se manda junto con userDiscountId.
  promoRedemptionId?: string;
  service?: string;
  // Idempotencia de cobro. Ambos opcionales — sin ellos,
  // /payments se comporta exactamente igual que antes.
  intentKey?: string;
  fingerprint?: string;
}

export interface PaymentIntentStatusResponse {
  success: boolean;
  status?: "charging" | "charged" | "failed" | "unknown" | "confirmed";
  ecartpay_order_id?: string | null;
  order_id?: string | null;
  amount?: number;
  currency?: string;
  updated_at?: string;
  code?: string;
  error?: { type?: string; code?: string; message?: string };
}

export interface MsiOption {
  months: number;
  rate: number;
  minAmount: number;
  fixedInstallments: boolean;
}

export interface MsiConfig {
  isActive: boolean;
  visaMc: MsiOption[];
  amex: MsiOption[];
}

export interface PaymentHistory {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  description?: string;
}
