import { requestWithAuth, type ApiResponse } from "./request-helper";
import {
  PaymentMethod,
  AddPaymentMethodRequest,
  ProcessPaymentRequest,
  PaymentHistory,
  CartItemForPayment,
  MsiConfig,
  PaymentIntentStatusResponse,
} from "@/types/payment.types";

class PaymentService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    return await requestWithAuth<T>(endpoint, options);
  }

  /**
   * Añadir método de pago
   */
  async addPaymentMethod(
    paymentData: AddPaymentMethodRequest,
  ): Promise<ApiResponse<{ paymentMethod: PaymentMethod }>> {
    return this.request("/payment-methods", {
      method: "POST",
      body: JSON.stringify(paymentData),
    });
  }

  /**
   * Obtener métodos de pago del usuario
   */
  async getPaymentMethods(): Promise<
    ApiResponse<{ paymentMethods: PaymentMethod[] }>
  > {
    return this.request("/payment-methods", {
      method: "GET",
    });
  }

  /**
   * Eliminar método de pago
   */
  async deletePaymentMethod(
    paymentMethodId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request(`/payment-methods/${paymentMethodId}`, {
      method: "DELETE",
    });
  }

  /**
   * Establecer método de pago como predeterminado
   */
  async setDefaultPaymentMethod(
    paymentMethodId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.request(`/payment-methods/${paymentMethodId}/default`, {
      method: "PUT",
    });
  }

  /**
   * Procesar pago
   */
  async processPayment(
    paymentData: ProcessPaymentRequest,
  ): Promise<ApiResponse<any>> {
    return this.request("/payments", {
      method: "POST",
      body: JSON.stringify(paymentData),
    });
  }

  /**
   * Obtener historial de pagos
   */
  async getPaymentHistory(): Promise<ApiResponse<PaymentHistory[]>> {
    return this.request("/payments/history", {
      method: "GET",
    });
  }

  /**
   * Pagar por una orden de platillo específica (para Pick & Go)
   */
  async payDishOrder(
    dishId: string,
    paymentMethodId?: string | null,
  ): Promise<ApiResponse<any>> {
    return this.request(`/dishes/${dishId}/pay`, {
      method: "POST",
      body: JSON.stringify({ paymentMethodId }),
    });
  }

  /**
   * Pagar una orden Pick & Go
   */
  async payPickAndGoOrder(
    orderId: string,
    paymentMethodId?: string | null,
    amount?: number,
  ): Promise<ApiResponse<any>> {
    return this.request(`/pick-and-go/orders/${orderId}/pay`, {
      method: "POST",
      body: JSON.stringify({ paymentMethodId, amount }),
    });
  }

  // Crea una orden en Ecart Pay para Apple Pay y regresa el orderId
  async createApplePayOrder(params: {
    amount: number;
    currency: string;
    tableNumber?: string;
    restaurantId?: string;
    baseAmount?: number;
    tipAmount?: number;
    items?: CartItemForPayment[];
    // Para que el backend descuente el platillo real que cobra —
    // sin esto, eCartPay cobraba precio completo aunque hubiera descuento.
    // Nunca se redime aquí (esta orden se crea al montar la pantalla, TK-0099
    // — el backend solo LEE el %, el consumo real sigue pasando en /confirm).
    userDiscountId?: string;
    promoRedemptionId?: string;
  }): Promise<ApiResponse<{ orderId: string }>> {
    return this.request("/payments/apple-pay/order", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // Crea una orden en Ecart Pay para Google Pay y regresa el orderId
  async createGooglePayOrder(params: {
    amount: number;
    currency: string;
    tableNumber?: string;
    restaurantId?: string;
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
  // Estado real de la orden en EcartPay (para wallets cuyo callback no llegó).
  // Respuesta plana {success, status}, no {success, data}.
  async getEcartOrderStatus(orderId: string): Promise<string | null> {
    const result = await this.request<unknown>(
      `/payments/orders/${encodeURIComponent(orderId)}/status`,
      { method: "GET" },
    );
    return (result as { status?: string | null }).status ?? null;
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

  /**
   * Migrar métodos de pago de guest a usuario autenticado
   */
  async migrateGuestPaymentMethods(
    guestId: string,
  ): Promise<ApiResponse<{ migratedCount: number }>> {
    return this.request("/payment-methods/migrate-from-guest", {
      method: "POST",
      body: JSON.stringify({ guestId }),
    });
  }
}

export const paymentService = new PaymentService();
