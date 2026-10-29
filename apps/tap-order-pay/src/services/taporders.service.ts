import { requestWithAuth, type ApiResponse } from "./request-helper";

// Tipos para dish individual
export interface Dish {
  id: string;
  menu_item_id?: number | null;
  item: string;
  quantity: number;
  price: number;
  extra_price: number;
  status: "preparing" | "ready" | "delivered";
  payment_status: "not_paid" | "paid";
  total_price: number;
  images: string[];
  custom_fields: any | null;
  special_instructions?: string | null;
  user_order_id: string | null;
  tap_order_id: string;
}

export interface LastOrderDish {
  id: string;
  menu_item_id: number;
  item: string;
  quantity: number;
  price: number;
  extra_price: number;
  images: string[];
  custom_fields: any | null;
  special_instructions?: string | null;
}

export interface LastOrderResponse {
  hasLastOrder: boolean;
  data: { tap_order_id: string; dishes: LastOrderDish[] } | null;
}

export interface TapOrderInfo {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  clerk_user_id: string | null;
  total_amount: number;
  payment_status: "pending" | "paid" | "failed";
  order_status: "pending" | "completed";
  created_at: string;
  updated_at: string;
}

export interface TableInfo {
  id: string;
  table_number: string;
  restaurant_id: number;
  status: string;
}

export interface OrderSummary {
  total_dishes: number;
  total_items: number;
  calculated_total: number;
}

export interface TapOrder {
  tap_order: TapOrderInfo;
  table: TableInfo;
  dishes: Dish[];
  summary: OrderSummary;
}

export interface TapOrderResponse {
  data: TapOrder;
}

export interface ActiveOrder {
  tap_order: TapOrderInfo;
  table: TableInfo;
  dishes: Dish[];
  pending_dishes_count: number;
}

export interface ActiveOrderResponse {
  hasActiveOrder: boolean;
  data: ActiveOrder | null;
  orders: ActiveOrder[];
}

export interface DishOrderData {
  user_id: string | null;
  guest_id: string | null;
  guest_name: string;
  item: string;
  quantity: number;
  price: number;
  branch_number: number;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  clerk_user_id?: string | null;
  images?: string[];
  custom_fields?: any;
  extra_price?: number;
  menu_item_id?: string | null;
  special_instructions?: string | null;
  order_notes?: string | null;
}

export interface PaymentTransactionData {
  payment_method_id: string | null;
  restaurant_id: number;
  id_table_order?: string | null;
  id_tap_orders_and_pay?: string | null;
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
  currency?: string;
}

export interface ConfirmTapOrderItem {
  item: string;
  quantity?: number;
  price: number;
  images?: string[];
  custom_fields?: any;
  extra_price?: number;
  menu_item_id?: string | null;
  special_instructions?: string | null;
}

export interface ConfirmTapOrderData {
  clerk_user_id?: string | null;
  guest_id?: string | null;
  user_id?: string | null;
  is_guest?: boolean;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  restaurant_id: number;
  branch_number: number;
  table_number: string;
  order_notes?: string | null;
  items: ConfirmTapOrderItem[];
  payment_method_id?: string | null;
  base_amount: number;
  tip_amount?: number;
  total_amount_charged: number;
  currency?: string;
  payment_source?: "apple_pay" | "google_pay" | "saved_card" | "dev" | null;
  ecartpay_order_id?: string | null;
  transaction_by?: string | null;
  installments?: number | null;
  google_pay_token?: string | null;
  // comisiones (el backend las recalcula, se envían como referencia)
  iva_tip?: number;
  even_commission_total?: number;
  even_commission_client?: number;
  even_commission_restaurant?: number;
  iva_even_client?: number;
  iva_even_restaurant?: number;
  even_client_charge?: number;
  even_restaurant_charge?: number;
  even_rate_applied?: number;
}

export interface ConfirmTapOrderResponse {
  success: boolean;
  data?: { order: any; transaction: any };
  error?: string;
  // Código semántico ("confirm_in_progress",
  // "confirm_conflict"...) y señal de replay — para no reintentar /payments
  // ni reencolar la impresión cuando la orden ya existía.
  code?: string;
  replayed?: boolean;
}

class TapOrderService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    // Usar el helper con refresh automático
    return requestWithAuth<T>(endpoint, options);
  }

  // Crear una orden de platillo (dish order)
  async createDishOrder(
    restaurantId: string,
    branchNumber: string,
    tableNumber: string,
    dishOrderData: DishOrderData,
  ): Promise<ApiResponse<any>> {
    return this.request(
      `/tap-orders/restaurant/${restaurantId}/branch/${branchNumber}/table/${tableNumber}/dishes`,
      {
        method: "POST",
        body: JSON.stringify(dishOrderData),
      },
    );
  }

  // Actualizar el estado de pago de una orden tap
  async updatePaymentStatus(
    tapOrderId: string,
    paymentStatus: "pending" | "paid" | "failed",
  ): Promise<ApiResponse<any>> {
    return this.request(`/tap-orders/${tapOrderId}/payment-status`, {
      method: "PATCH",
      body: JSON.stringify({ payment_status: paymentStatus }),
    });
  }

  // Actualizar el estado de una orden tap
  async updateOrderStatus(
    tapOrderId: string,
    orderStatus: "pending" | "completed",
  ): Promise<ApiResponse<any>> {
    return this.request(`/tap-orders/${tapOrderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: orderStatus }),
    });
  }

  // Registrar transacción de pago para trazabilidad
  async recordPaymentTransaction(
    transactionData: PaymentTransactionData,
  ): Promise<ApiResponse<any>> {
    return this.request("/payment-transactions", {
      method: "POST",
      body: JSON.stringify(transactionData),
    });
  }

  // Marcar dish order como pagado
  async markDishOrderAsPaid(dishOrderId: string): Promise<ApiResponse<any>> {
    return this.request(`/dish-orders/${dishOrderId}/mark-paid`, {
      method: "POST",
    });
  }

  // Obtener una orden por ID
  async getOrderById(orderId: string): Promise<ApiResponse<TapOrderResponse>> {
    return this.request(`/tap-orders/${orderId}`, {
      method: "GET",
    });
  }

  // Obtener orden activa por clerk_user_id (user_id o guest_id) y restaurantId
  async getActiveOrderByUser(
    clientId: string,
    restaurantId: number,
  ): Promise<ApiResponse<ActiveOrderResponse>> {
    return this.request(
      `/tap-orders/restaurant/${restaurantId}/active/user/${clientId}`,
      {
        method: "GET",
      },
    );
  }

  // Confirmar orden atómica: crea tap order + dish orders + transacción en una sola llamada
  async confirmOrder(
    data: ConfirmTapOrderData,
  ): Promise<ConfirmTapOrderResponse> {
    try {
      const res = await this.request<any>("/tap-orders/confirm", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return {
        success: res.success,
        data: res.data,
        error: typeof res.error === "string" ? res.error : res.error?.message,
        code: res.code ?? (typeof res.error === "object" ? res.error?.code : undefined),
        replayed: res.replayed,
      };
    } catch (error) {
      console.error("Error confirming tap order:", error);
      return { success: false, error: "Error al confirmar la orden" };
    }
  }

  // Obtener última orden de un usuario en un restaurante
  async getLastOrderByUser(
    clientId: string,
    restaurantId: number,
  ): Promise<ApiResponse<LastOrderResponse>> {
    return this.request(
      `/tap-orders/restaurant/${restaurantId}/user/${clientId}/last`,
      {
        method: "GET",
      },
    );
  }
}

export const tapOrderService = new TapOrderService();
