import { apiService, type ApiResponse } from "@/app/utils/api";

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

export interface CartItemForPayment {
  name: string;
  price: number;
  quantity: number;
  extraPrice?: number;
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

export interface ProcessPaymentParams {
  paymentMethodId: string;
  amount: number;
  currency: string;
  description: string;
  orderId: string;
  tableNumber: string | undefined;
  restaurantId: string;
  installments?: number;
  baseAmount?: number;
  tipAmount?: number;
  items?: CartItemForPayment[];
  // Flex Bill: le permiten al backend recalcular el monto real a cobrar
  // desde los dish_order de la mesa en vez de confiar en baseAmount/amount
  // (que puede haberse quedado desactualizado) — ver processPayment en
  // paymentController.js / computeFlexBillAmountDue en flexBillService.js.
  id_table_order?: string | null;
  payment_type?: string;
  selected_item_ids?: string[];
  // Idempotencia de cobro. Ambos opcionales — sin ellos,
  // /payments se comporta exactamente igual que antes.
  intentKey?: string;
  fingerprint?: string;
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

// Servicio para manejar operaciones de pago
export const paymentService = {
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

  // Obtiene los métodos de pago del usuario
  async getPaymentMethods() {
    return await apiService.getPaymentMethods();
  },

  // Procesa un pago con un método de pago específico
  async processPayment(params: ProcessPaymentParams) {
    return await apiService.processPayment(params);
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

  // Crea una orden en Ecart Pay para Apple Pay y regresa el orderId
  async createApplePayOrder(params: {
    amount: number;
    currency: string;
    tableNumber?: string;
    restaurantId?: string;
    baseAmount?: number;
    tipAmount?: number;
    items?: CartItemForPayment[];
    id_table_order?: string | null;
    payment_type?: string;
    selected_item_ids?: string[];
  }): Promise<ApiResponse<{ orderId: string }>> {
    return makeRequest("/payments/apple-pay/order", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  // Crea una orden en Ecart Pay para Google Pay y regresa el orderId
  async createGooglePayOrder(params: {
    amount: number;
    currency: string;
    tableNumber?: string;
    restaurantId?: string;
    baseAmount?: number;
    tipAmount?: number;
    items?: CartItemForPayment[];
    id_table_order?: string | null;
    payment_type?: string;
    selected_item_ids?: string[];
  }): Promise<ApiResponse<{ orderId: string }>> {
    return makeRequest("/payments/google-pay/order", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  // Consulta el estado real de una orden en EcartPay — para reconciliar pagos
  // de Apple/Google Pay cuyo callback in-page se haya perdido
  async getOrderStatus(
    orderId: string,
  ): Promise<ApiResponse<{ status: string | null }>> {
    return makeRequest(`/payments/orders/${orderId}/status`);
  },

  // Migra los métodos de pago de guest a usuario autenticado
  async migrateGuestPaymentMethods(
    guestId: string,
  ): Promise<ApiResponse<{ migratedCount: number }>> {
    return apiService.migrateGuestPaymentMethods(guestId);
  },

  // Consulta el estado de un intento de cobro — para el
  // polling de "Verificando tu pago…" en vez de reintentar /payments.
  async getPaymentIntentStatus(intentKey: string) {
    return apiService.getPaymentIntentStatus(intentKey);
  },

  async getMsiConfiguration(): Promise<ApiResponse<MsiConfig>> {
    const result = await makeRequest("/payments/installment-config");
    if (result.success && result.data) {
      return { success: true, data: result.data.data ?? result.data };
    }
    return result;
  },
};
