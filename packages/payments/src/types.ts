/**
 * Tipos de pagos y métodos de pago compartidos por todas las apps.
 * Origen: Tap Order & Pay y Room Service (`payment.service.ts` y
 * `payment.types.ts`), unificados en el superset de ambos.
 */

export interface PaymentMethod {
  id: string;
  lastFourDigits: string;
  cardBrand: string;
  cardType: string;
  expiryMonth?: number;
  expiryYear?: number;
  cardholderName?: string;
  isDefault: boolean;
  isSystemCard?: boolean;
  createdAt?: string;
}

export interface AddPaymentMethodRequest {
  fullName: string;
  email?: string;
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
  currency: string;
  description: string;
  orderId: string;
  orderType?: string;
  // Ubicación del pedido: mesa (Tap Order & Pay) o habitación (Room Service).
  tableNumber?: string;
  roomNumber?: string;
  restaurantId: string;
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
  // Flex Bill (dividir cuenta): le permiten al backend recalcular el monto real
  // a cobrar desde los dish_order de la mesa en vez de confiar en
  // baseAmount/amount. Opcionales: el resto de las apps no los envía.
  id_table_order?: string | null;
  payment_type?: string;
  selected_item_ids?: string[];
  // Idempotencia de cobro. Ambos opcionales — sin ellos,
  // /payments se comporta exactamente igual que antes.
  intentKey?: string;
  fingerprint?: string;
}

/** Respuesta de POST /payments cuando el cobro se hizo (o se re-jugó). */
export interface ProcessPaymentResult {
  payment?: { id?: string | null; [key: string]: unknown };
  [key: string]: unknown;
}

export interface WalletOrderRequest {
  amount: number;
  currency: string;
  tableNumber?: string;
  restaurantId?: string;
  customerName?: string;
  baseAmount?: number;
  tipAmount?: number;
  items?: CartItemForPayment[];
  userDiscountId?: string;
  promoRedemptionId?: string;
  // Flex Bill (dividir cuenta): le permiten al backend recalcular el monto real
  // a cobrar desde los dish_order de la mesa en vez de confiar en
  // baseAmount/amount. Opcionales: el resto de las apps no los envía.
  id_table_order?: string | null;
  payment_type?: string;
  selected_item_ids?: string[];
}

export type PaymentIntentStatus =
  | "charging"
  | "charged"
  | "failed"
  | "unknown"
  | "confirmed";

// GET /payments/intents/:key responde los campos sueltos al nivel raíz
// (junto a `success`), no anidados bajo `data` — a diferencia del resto de
// endpoints de este servicio.
export interface PaymentIntentStatusResponse {
  success: boolean;
  status?: PaymentIntentStatus;
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
  date?: string;
  currency?: string;
  status: string;
  createdAt?: string;
  description?: string;
}
