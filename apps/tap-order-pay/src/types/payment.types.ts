/**
 * Tipos relacionados con pagos y métodos de pago
 */

export interface PaymentMethod {
  id: string;
  lastFourDigits: string;
  cardType: string;
  cardBrand: string;
  expiryMonth?: number;
  expiryYear?: number;
  cardholderName?: string;
  isDefault: boolean;
  isSystemCard?: boolean;
  createdAt?: string;
}

export interface AddPaymentMethodRequest {
  fullName: string;
  email: string;
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
  baseAmount?: number;
  tipAmount?: number;
  items?: CartItemForPayment[];
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
