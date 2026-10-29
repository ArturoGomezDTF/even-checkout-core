import { requestWithAuth } from "./request-helper";
import type { MsiConfig } from "@/types/payment.types";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    type?: string;
    code?: string;
    message?: string;
    details?: any;
  };
  // Código semántico de payment_intents/payment_confirmations
  // ("payment_in_progress", "intent_mismatch", "payment_unknown",
  // "charge_unconfirmed", "idempotency_unavailable"...).
  code?: string;
  // true cuando /payments devolvió el mismo cobro de un intento anterior en
  // vez de cobrar de nuevo — ver request-helper.ts.
  replayed?: boolean;
  // Estatus HTTP cuando el backend respondió con error — ver request-helper.ts.
  status?: number;
}

/**
 * true si el backend rechazó la orden de wallet de forma definitiva: un 4xx con
 * código semántico (400 baseAmount <= 0, 422 payment_rejected, ...), donde
 * reintentar con los mismos datos fallaría igual. El errorHandler del backend
 * pone `code` también en los 5xx, así que el código solo no basta: un 500/502
 * pasajero (o un 408/429) no debe ocultar Apple/Google Pay.
 */
export function isDefinitiveWalletRejection(result: {
  status?: number;
  code?: string;
  error?: { code?: string };
}): boolean {
  const { status } = result;
  if (status === undefined || status < 400 || status >= 500) return false;
  if (status === 408 || status === 429) return false;
  return !!(result.code ?? result.error?.code);
}

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
  tableNumber: string;
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
  // Idempotencia de cobro. Ambos opcionales — sin ellos,
  // /payments se comporta exactamente igual que antes.
  intentKey?: string;
  fingerprint?: string;
}

// GET /payments/intents/:key responde los campos sueltos al nivel raíz
// (junto a `success`), no anidados bajo `data` — a diferencia del resto de
// endpoints de este servicio.
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

export interface PaymentHistory {
  id: string;
  amount: number;
  date: string;
  status: string;
}

class PaymentService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    // Usar el helper con refresh automático
    const result = await requestWithAuth<T>(endpoint, options);

    // Adaptar el formato de error al esperado por PaymentService
    if (!result.success && result.error && typeof result.error === "string") {
      return {
        success: false,
        error: {
          type: "api_error",
          message: result.error,
        },
      };
    }

    return result as ApiResponse<T>;
  }

  // Añadir método de pago
  async addPaymentMethod(
    paymentData: AddPaymentMethodRequest,
  ): Promise<ApiResponse<{ paymentMethod: PaymentMethod }>> {
    return this.request("/payment-methods", {
      method: "POST",
      body: JSON.stringify(paymentData),
    });
  }

  // Obtener métodos de pago del usuario
  async getPaymentMethods(): Promise<
    ApiResponse<{ paymentMethods: PaymentMethod[] }>
  > {
    return this.request("/payment-methods", {
      method: "GET",
    });
  }

  // Eliminar método de pago
  async deletePaymentMethod(
    paymentMethodId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request(`/payment-methods/${paymentMethodId}`, {
      method: "DELETE",
    });
  }

  // Establecer método de pago como predeterminado
  async setDefaultPaymentMethod(
    paymentMethodId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request(`/payment-methods/${paymentMethodId}/default`, {
      method: "PUT",
    });
  }

  // Procesar pago
  async processPayment(
    paymentData: ProcessPaymentRequest,
  ): Promise<ApiResponse<any>> {
    return this.request("/payments", {
      method: "POST",
      body: JSON.stringify(paymentData),
    });
  }

  // Obtener historial de pagos
  async getPaymentHistory(): Promise<ApiResponse<PaymentHistory[]>> {
    return this.request("/payments/history", {
      method: "GET",
    });
  }

  // Crea una orden en Ecart Pay para Apple Pay y regresa el orderId
  async createApplePayOrder(params: {
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
  }): Promise<ApiResponse<{ orderId: string }>> {
    return this.request("/payments/apple-pay/order", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // Estado real de la orden en EcartPay (para wallets cuyo callback no llegó).
  // Respuesta plana {success, status}, no {success, data}.
  async getEcartOrderStatus(orderId: string): Promise<string | null> {
    const result = await this.request<unknown>(
      `/payments/orders/${encodeURIComponent(orderId)}/status`,
      { method: "GET" },
    );
    return (result as { status?: string | null }).status ?? null;
  }

  // Crea una orden en Ecart Pay para Google Pay y regresa el orderId
  async createGooglePayOrder(params: {
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
  }): Promise<ApiResponse<{ orderId: string }>> {
    return this.request("/payments/google-pay/order", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // Migrar métodos de pago de guest a usuario autenticado
  async migrateGuestPaymentMethods(
    guestId: string,
  ): Promise<ApiResponse<{ migratedCount: number }>> {
    return this.request("/payment-methods/migrate-from-guest", {
      method: "POST",
      body: JSON.stringify({ guestId }),
    });
  }

  async getMsiConfiguration(): Promise<ApiResponse<MsiConfig>> {
    return this.request("/payments/installment-config", { method: "GET" });
  }

  // Consulta el estado de un intento de cobro — para el
  // polling de "Verificando tu pago…" en vez de reintentar /payments.
  // Respuesta plana (ver PaymentIntentStatusResponse), no pasa por
  // `this.request` porque ese método asume el shape {success,data,error}.
  async getPaymentIntentStatus(
    intentKey: string,
  ): Promise<PaymentIntentStatusResponse> {
    const result = await requestWithAuth<unknown>(
      `/payments/intents/${encodeURIComponent(intentKey)}`,
      { method: "GET" },
    );
    return result as unknown as PaymentIntentStatusResponse;
  }
}

export const paymentService = new PaymentService();
