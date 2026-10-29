import { requestWithAuth, type ApiResponse } from "./request-helper";
import { TapPayOrder, DishOrder, ActiveUser } from "../types/order";
import { PaymentRequest, PaymentResult } from "../types/payment";

export interface OrderSummary {
  total_dishes: number;
  total_items: number;
  calculated_total: number;
  remaining_amount: number;
}

// El backend devuelve directamente el objeto TapPayOrder, no lo envuelve
export type TapPayOrderResponse = TapPayOrder;

class OrderService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    return requestWithAuth<T>(endpoint, options);
  }

  // Obtener orden activa por mesa
  async getActiveOrderByTable(
    restaurantId: string,
    branchNumber: string,
    tableNumber: string,
  ): Promise<ApiResponse<TapPayOrderResponse>> {
    return this.request(
      `/tap-pay/restaurants/${restaurantId}/branches/${branchNumber}/tables/${tableNumber}/order`,
      { method: "GET" },
    );
  }

  // Obtener orden por ID
  async getOrderById(
    orderId: string,
  ): Promise<ApiResponse<TapPayOrderResponse>> {
    return this.request(`/tap-pay/orders/${orderId}`, { method: "GET" });
  }

  // Obtener items de una orden
  async getOrderItems(orderId: string): Promise<ApiResponse<DishOrder[]>> {
    return this.request(`/tap-pay/orders/${orderId}/items`, {
      method: "GET",
    });
  }

  // Sincronizar orden con POS (agrega platillos nuevos del POS a Supabase)
  async syncOrderFromPOS(orderId: string): Promise<ApiResponse<any>> {
    return this.request(`/tap-pay/orders/${orderId}/sync-from-pos`, {
      method: "POST",
    });
  }

  // Procesar pago
  async processPayment(
    paymentRequest: PaymentRequest,
  ): Promise<ApiResponse<PaymentResult>> {
    return this.request(`/tap-pay/orders/${paymentRequest.orderId}/pay`, {
      method: "POST",
      body: JSON.stringify(paymentRequest),
    });
  }

  // Pagar un platillo específico
  async payDishOrder(
    dishId: string,
    paymentMethodId: string | null,
  ): Promise<ApiResponse<any>> {
    return this.request(`/tap-pay/dishes/${dishId}/pay`, {
      method: "POST",
      body: JSON.stringify({ paymentMethodId }),
    });
  }

  // Pagar un monto específico
  async payOrderAmount(
    orderId: string,
    amount: number,
    paymentMethodId: string | null,
    userId?: string,
    guestName?: string,
  ): Promise<ApiResponse<any>> {
    return this.request(`/tap-pay/orders/${orderId}/pay-amount`, {
      method: "POST",
      body: JSON.stringify({ amount, paymentMethodId, userId, guestName }),
    });
  }

  // Inicializar split bill
  async initializeSplitBill(
    orderId: string,
    numberOfPeople: number,
    userIds?: string[],
    guestNames?: string[],
  ): Promise<ApiResponse<any>> {
    return this.request(`/tap-pay/orders/${orderId}/split-bill`, {
      method: "POST",
      body: JSON.stringify({ numberOfPeople, userIds, guestNames }),
    });
  }

  // Pagar parte del split
  async paySplitAmount(
    orderId: string,
    paymentMethodId: string | null,
    userId?: string,
    guestName?: string,
  ): Promise<ApiResponse<any>> {
    return this.request(`/tap-pay/orders/${orderId}/pay-split`, {
      method: "POST",
      body: JSON.stringify({ paymentMethodId, userId, guestName }),
    });
  }

  // Obtener estado de split payment
  async getSplitPaymentStatus(orderId: string): Promise<ApiResponse<any>> {
    return this.request(`/tap-pay/orders/${orderId}/split-status`, {
      method: "GET",
    });
  }

  // Obtener usuarios activos
  async getActiveUsers(orderId: string): Promise<ApiResponse<ActiveUser[]>> {
    return this.request(`/tap-pay/orders/${orderId}/active-users`, {
      method: "GET",
    });
  }

  // Agregar usuario activo
  async addActiveUser(
    orderId: string,
    userId?: string,
    guestId?: string | null,
    guestName?: string,
  ): Promise<ApiResponse<any>> {
    return this.request(`/tap-pay/orders/${orderId}/active-users`, {
      method: "POST",
      body: JSON.stringify({ userId, guestId, guestName }),
    });
  }

  // Actualizar estado de orden
  async updateOrderStatus(
    orderId: string,
    orderStatus: TapPayOrder["order_status"],
  ): Promise<ApiResponse<any>> {
    return this.request(`/tap-pay/orders/${orderId}/status`, {
      method: "PUT",
      body: JSON.stringify({ orderStatus }),
    });
  }

  // Actualizar estado de platillo
  async updateDishStatus(
    dishId: string,
    status: DishOrder["status"],
  ): Promise<ApiResponse<any>> {
    return this.request(`/tap-pay/dishes/${dishId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  // Obtener métricas del dashboard
  async getDashboardMetrics(params: {
    restaurantId: string;
    branchNumber?: string;
    timeRange?: "daily" | "weekly" | "monthly";
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<any>> {
    // El backend lee la query en snake_case (#435)
    const queryParams = new URLSearchParams({
      restaurant_id: params.restaurantId,
      ...(params.branchNumber && { branch_number: params.branchNumber }),
      ...(params.timeRange && { time_range: params.timeRange }),
      ...(params.startDate && { start_date: params.startDate }),
      ...(params.endDate && { end_date: params.endDate }),
    });

    return this.request(`/tap-pay/dashboard/metrics?${queryParams}`, {
      method: "GET",
    });
  }
}

export const orderService = new OrderService();
