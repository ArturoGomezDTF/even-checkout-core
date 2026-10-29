import { createPaymentService } from "@even/payments";
import type { ApiResponse } from "@even/api-client";
import { apiService } from "@/app/utils/api";
import { requestWithAuth } from "./request-helper";

export type { ApiResponse } from "@even/api-client";
export {
  isDefinitiveWalletRejection,
  type AddPaymentMethodRequest,
  type CartItemForPayment,
  type MsiConfig,
  type MsiOption,
  type PaymentHistory,
  type PaymentIntentStatus,
  type PaymentIntentStatusResponse,
  type PaymentMethod,
  type ProcessPaymentRequest,
} from "@even/payments";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export interface PayDishOrderParams {
  dishOrderId: string;
  paymentMethodId: string | null;
}

export interface JoinTableParams {
  restaurantId: string;
  branchNumber: string;
  tableNumber: string;
  userId?: string | null;
  guestName?: string | null;
  guestId?: string | null;
}

export interface PayTableAmountParams {
  restaurantId: string;
  branchNumber: string;
  tableNumber: string;
  amount: number;
  userId?: string | null;
  guestId?: string | null;
  guestName?: string | null;
  paymentMethodId: string | null;
}

export interface RecordPaymentTransactionParams {
  payment_method_id: string | null;
  restaurant_id: number;
  id_table_order: string | null;
  id_tap_orders_and_pay: string | null;
  ecartpay_order_id?: string | null;
  payment_source?: string | null;
  payment_type?: string;
  selected_item_ids?: string[];
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
}

// Breakdown real ya cobrado que devuelve /api/payments cuando el pago es de
// Flex Bill — se debe reenviar tal cual a recordPaymentTransaction en vez de
// recalcular localmente desde los query params.
export interface FlexBillBreakdown {
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
}

async function makeRequest(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<any>> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("even_access_token")
      : null;
  const tableSession =
    typeof window !== "undefined"
      ? localStorage.getItem("even-table-session")
      : null;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tableSession ? { "x-table-session": tableSession } : {}),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      success: false,
      error: {
        type: data.code || "API_ERROR",
        message: data.error || data.message || "Request failed",
        details: data,
      },
    };
  }

  return {
    success: true,
    data,
  };
}

// Endpoints de pago compartidos (tarjetas, /payments, wallets, intents) salen de
// @even/payments. Aquí quedan los de mesa de Flex Bill (unirse, pagar monto o
// platillos, registrar la transacción), que viajan con x-table-session.
const sharedPaymentService = createPaymentService(requestWithAuth);

export const paymentService = {
  ...sharedPaymentService,

  // Marca un platillo como pagado
  async payDishOrder(
    dishOrderId: string,
    paymentMethodId: string | null,
  ): Promise<void> {
    await apiService.payDishOrder(dishOrderId, paymentMethodId);
  },

  // Une a la persona actual a la mesa/cuenta sin necesidad de ordenar
  async joinTable(params: JoinTableParams): Promise<ApiResponse<any>> {
    const {
      restaurantId,
      branchNumber,
      tableNumber,
      userId,
      guestName,
      guestId,
    } = params;

    return makeRequest(
      `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/join`,
      {
        method: "POST",
        body: JSON.stringify({
          userId: userId || null,
          guestName: guestName || null,
          guestId: guestId || null,
        }),
      },
    );
  },

  // Registra el pago de un monto específico de la mesa
  async payTableAmount(
    params: PayTableAmountParams,
  ): Promise<ApiResponse<any>> {
    const {
      restaurantId,
      branchNumber,
      tableNumber,
      amount,
      userId,
      guestId,
      guestName,
      paymentMethodId,
    } = params;

    return makeRequest(
      `/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/pay`,
      {
        method: "POST",
        body: JSON.stringify({
          amount,
          userId: userId || null,
          guestId: guestId || null,
          guestName: guestName || null,
          paymentMethodId,
        }),
      },
    );
  },

  // Registra una transacción de pago en la base de datos
  async recordPaymentTransaction(
    params: RecordPaymentTransactionParams,
  ): Promise<void> {
    await apiService.recordPaymentTransaction(params);
  },

  // Paga múltiples platillos de un usuario
  async payUserDishes(
    dishOrders: any[],
    userName: string,
    paymentMethodId: string | null,
  ): Promise<void> {
    const userDishes = dishOrders.filter(
      (dish) =>
        dish.guest_name === userName &&
        (dish.payment_status === "not_paid" || !dish.payment_status),
    );

    for (const dish of userDishes) {
      try {
        await this.payDishOrder(dish.dish_order_id, paymentMethodId);
      } catch (error) {
        console.error(`Error paying dish ${dish.dish_order_id}:`, error);
        throw error;
      }
    }
  },

  // Paga platillos seleccionados específicamente
  async paySelectedDishes(
    selectedItems: string[],
    paymentMethodId: string | null,
  ): Promise<void> {
    for (const dishId of selectedItems) {
      try {
        await this.payDishOrder(dishId, paymentMethodId);
      } catch (error) {
        console.error(`Error paying selected dish ${dishId}:`, error);
        throw error;
      }
    }
  },
};
