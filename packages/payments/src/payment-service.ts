import type { ApiResponse, Requester } from "@even/api-client";
import type {
  AddPaymentMethodRequest,
  MsiConfig,
  PaymentHistory,
  PaymentIntentStatusResponse,
  PaymentMethod,
  ProcessPaymentRequest,
  ProcessPaymentResult,
  WalletOrderRequest,
} from "./types";

/**
 * Cliente de los endpoints de pago de even-backend. Recibe el transporte
 * (normalmente `createApiClient` de `@even/api-client`) para no acoplarse al
 * auth de cada app.
 */
export function createPaymentService(requestWithAuth: Requester) {
  async function request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    const result = await requestWithAuth<T>(endpoint, options);

    // Un 2xx con `error` string se adapta al formato objeto que esperan los
    // callers (`.error?.message`).
    if (!result.success && result.error && typeof result.error === "string") {
      return {
        success: false,
        error: { type: "api_error", message: result.error },
      };
    }

    return result;
  }

  return {
    addPaymentMethod(
      paymentData: AddPaymentMethodRequest,
    ): Promise<ApiResponse<{ paymentMethod: PaymentMethod }>> {
      return request("/payment-methods", {
        method: "POST",
        body: JSON.stringify(paymentData),
      });
    },

    getPaymentMethods(): Promise<
      ApiResponse<{ paymentMethods: PaymentMethod[] }>
    > {
      return request("/payment-methods", { method: "GET" });
    },

    deletePaymentMethod(
      paymentMethodId: string,
    ): Promise<ApiResponse<{ message: string }>> {
      return request(`/payment-methods/${encodeURIComponent(paymentMethodId)}`, {
        method: "DELETE",
      });
    },

    setDefaultPaymentMethod(
      paymentMethodId: string,
    ): Promise<ApiResponse<{ message: string }>> {
      return request(
        `/payment-methods/${encodeURIComponent(paymentMethodId)}/default`,
        { method: "PUT" },
      );
    },

    // Migrar métodos de pago de guest a usuario autenticado
    migrateGuestPaymentMethods(
      guestId: string,
    ): Promise<ApiResponse<{ migratedCount: number }>> {
      return request("/payment-methods/migrate-from-guest", {
        method: "POST",
        body: JSON.stringify({ guestId }),
      });
    },

    // Cobro con tarjeta guardada. Para el flujo con idempotencia usar
    // `chargeSavedCard` (charge.ts), que envuelve esta llamada.
    processPayment(
      paymentData: ProcessPaymentRequest,
    ): Promise<ApiResponse<ProcessPaymentResult> & ProcessPaymentResult> {
      return request("/payments", {
        method: "POST",
        body: JSON.stringify(paymentData),
      }) as Promise<ApiResponse<ProcessPaymentResult> & ProcessPaymentResult>;
    },

    getPaymentHistory(): Promise<ApiResponse<PaymentHistory[]>> {
      return request("/payments/history", { method: "GET" });
    },

    getMsiConfiguration(): Promise<ApiResponse<MsiConfig>> {
      return request("/payments/installment-config", { method: "GET" });
    },

    // Crea una orden en Ecart Pay para Apple Pay y regresa el orderId
    createApplePayOrder(
      params: WalletOrderRequest,
    ): Promise<ApiResponse<{ orderId: string }>> {
      return request("/payments/apple-pay/order", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },

    // Crea una orden en Ecart Pay para Google Pay y regresa el orderId
    createGooglePayOrder(
      params: WalletOrderRequest,
    ): Promise<ApiResponse<{ orderId: string }>> {
      return request("/payments/google-pay/order", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },

    // Estado real de la orden en EcartPay (para wallets cuyo callback no llegó).
    // Respuesta plana {success, status}, no {success, data}.
    async getEcartOrderStatus(orderId: string): Promise<string | null> {
      const result = await request<unknown>(
        `/payments/orders/${encodeURIComponent(orderId)}/status`,
        { method: "GET" },
      );
      return (result as { status?: string | null }).status ?? null;
    },

    // Consulta el estado de un intento de cobro — para el polling de
    // "Verificando tu pago…" en vez de reintentar /payments. Respuesta plana
    // (ver PaymentIntentStatusResponse), no pasa por `request` porque ese
    // método asume el shape {success,data,error}.
    async getPaymentIntentStatus(
      intentKey: string,
    ): Promise<PaymentIntentStatusResponse> {
      const result = await requestWithAuth<unknown>(
        `/payments/intents/${encodeURIComponent(intentKey)}`,
        { method: "GET" },
      );
      return result as unknown as PaymentIntentStatusResponse;
    },
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
