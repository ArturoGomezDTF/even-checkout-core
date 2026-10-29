import { createPaymentService } from "@even/payments";
import type { ApiResponse } from "@even/api-client";
import { requestWithAuth } from "@/app/services/request-helper";

export type { ApiResponse } from "@even/api-client";
export {
  isDefinitiveWalletRejection,
  type AddPaymentMethodRequest,
  type MsiConfig,
  type MsiOption,
  type PaymentHistory,
  type PaymentIntentStatus,
  type PaymentIntentStatusResponse,
  type PaymentMethod,
  type ProcessPaymentRequest,
} from "@even/payments";

const sharedPaymentService = createPaymentService(requestWithAuth);

function request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  return requestWithAuth<T>(endpoint, options);
}

// Endpoints de /tap-pay propios de esta app; el resto vive en @even/payments.

// Pagar un platillo individual
async function payDishOrder(params: {
  dishId: string;
  paymentMethodId: string | null;
  userId?: string;
  guestId?: string | null;
  guestName?: string | null;
}): Promise<ApiResponse<unknown>> {
  return request(`/tap-pay/dishes/${params.dishId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      paymentMethodId: params.paymentMethodId,
      userId: params.userId,
      guestId: params.guestId,
      guestName: params.guestName,
    }),
  });
}

// Pagar platillos seleccionados (itera sobre cada uno)
async function paySelectedDishes(params: {
  dishIds: string[];
  paymentMethodId: string | null;
  userId?: string;
  guestId?: string | null;
  guestName?: string | null;
}): Promise<ApiResponse<unknown>> {
  for (const dishId of params.dishIds) {
    try {
      await payDishOrder({
        dishId,
        paymentMethodId: params.paymentMethodId,
        userId: params.userId,
        guestId: params.guestId,
        guestName: params.guestName,
      });
    } catch (error) {
      console.error(`Error paying dish ${dishId}:`, error);
      throw error;
    }
  }
  return { success: true, data: { paidCount: params.dishIds.length } };
}

// Pagar monto de la orden
// NOTA: No se envía paymentMethodId - solo registra que se pagó el monto
async function payOrderAmount(params: {
  orderId: string;
  amount: number;
  tipAmount?: number;
  userId?: string;
  guestId?: string | null;
  guestName?: string | null;
  paymentMethodId: string | null;
  paymentSource?: string | null;
}): Promise<ApiResponse<unknown>> {
  return request(`/tap-pay/orders/${params.orderId}/pay-amount`, {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      tipAmount: params.tipAmount ?? 0,
      userId: params.userId,
      guestId: params.guestId,
      guestName: params.guestName,
      paymentSource: params.paymentSource ?? null,
    }),
  });
}

// Pagar monto de split
// NOTA: No se envía paymentMethodId - solo registra el pago de la división
async function paySplitAmount(params: {
  orderId: string;
  amount: number;
  tipAmount?: number;
  userId?: string;
  guestId?: string | null;
  guestName?: string | null;
  paymentMethodId: string | null;
  paymentSource?: string | null;
}): Promise<ApiResponse<unknown>> {
  return request(`/tap-pay/orders/${params.orderId}/pay-split`, {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      tipAmount: params.tipAmount ?? 0,
      userId: params.userId,
      guestId: params.guestId,
      guestName: params.guestName,
      paymentSource: params.paymentSource ?? null,
    }),
  });
}

// Registrar transacción de pago
async function recordPaymentTransaction(params: {
  payment_method_id: string | null;
  restaurant_id: number;
  id_tap_pay_order: string | null; // Para Tap & Pay (tap_pay_orders)
  ecartpay_order_id?: string | null;
  base_amount: number;
  tip_amount: number;
  iva_tip: number;
  even_commission_total: number;
  even_commission_client: number;
  even_commission_restaurant: number;
  iva_even_client: number;
  iva_even_restaurant: number;
  even_client_charge: number;
  even_restaurant_charge: number;
  even_rate_applied: number;
  total_amount_charged: number;
  subtotal_for_commission: number;
  currency: string;
  transaction_by?: string;
  payment_source?: string | null;
}): Promise<ApiResponse<unknown>> {
  return request("/payment-transactions", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export const paymentService = {
  ...sharedPaymentService,
  payDishOrder,
  paySelectedDishes,
  payOrderAmount,
  paySplitAmount,
  recordPaymentTransaction,
};
