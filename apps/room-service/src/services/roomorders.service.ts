import next from "next";
import { requestWithAuth, type ApiResponse } from "./request-helper";

// Tipos para dish individual
export interface Dish {
  id: string;
  item: string;
  quantity: number;
  price: number;
  extra_price: number;
  status: "pending" | "in_progress" | "ready" | "delivered";
  payment_status: "not_paid" | "paid";
  images: string[];
  custom_fields: any | null;
  user_order_id: string | null;
  room_order_id: string;
}

export interface RoomOrderInfo {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  user_id: string | null; // Puede ser user_id de Supabase Auth o guest_id
  total_amount: number;
  payment_status: "pending" | "paid" | "failed";
  order_status: "pending" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface RoomInfo {
  id: string;
  room_number: string;
  restaurant_id: number;
  status: string;
}

export interface OrderSummary {
  total_dishes: number;
  total_items: number;
  calculated_total: number;
}

export interface RoomOrder {
  room_order: RoomOrderInfo;
  room: RoomInfo;
  dishes: Dish[];
  summary: OrderSummary;
}

export interface RoomOrderResponse {
  data: RoomOrder;
}

export interface DishOrderData {
  user_id: string | null; // Puede ser user_id de Supabase Auth o guest_id
  item_name: string;
  quantity: number;
  price: number;
  branch_number: number;
  customer_name?: string;
  customer_phone?: string;
  images?: string[];
  custom_fields?: any;
  extra_price?: number;
}

export interface ActiveOrderResponse {
  hasActiveOrder: boolean;
  data: {
    room_order: {
      id: string;
      user_id: string | null;
      customer_name: string;
      total_amount: number;
      payment_status: string;
      order_status: string;
      room_id: string;
      created_at: string;
    };
    room: RoomInfo;
    dishes: Array<{
      id: string;
      item: string;
      quantity: number;
      price: number;
      status: string;
      payment_status: string;
      images: string[];
    }>;
    pending_dishes_count: number;
  } | null;
}

export interface PaymentTransactionData {
  payment_method_id: string | null;
  restaurant_id: number;
  id_table_order?: string | null;
  id_tap_orders_and_pay?: string | null;
  id_room_order?: string | null;
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

export interface ConfirmRoomOrderItem {
  item: string;
  quantity?: number;
  price: number;
  images?: string[];
  custom_fields?: any;
  extra_price?: number;
  menu_item_id?: string | null;
  special_instructions?: string | null;
}

export interface ConfirmRoomOrderData {
  clerk_user_id?: string | null;
  guest_id?: string | null;
  user_id?: string | null;
  is_guest?: boolean;
  customer_name: string;
  customer_phone?: string | null;
  restaurant_id: number;
  branch_number: number;
  room_number: string;
  items: ConfirmRoomOrderItem[];
  payment_method_id?: string | null;
  base_amount: number;
  tip_amount?: number;
  total_amount_charged: number;
  currency?: string;
  payment_source?: "apple_pay" | "google_pay" | "saved_card" | "dev" | null;
  ecartpay_order_id?: string | null;
  transaction_by?: string | null;
}

export interface ConfirmRoomOrderResponse {
  success: boolean;
  data?: { order: any; transaction: any };
  error?: { type?: string; code?: string; message?: string };
  code?: string;
  replayed?: boolean;
}

class RoomOrderService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    // Usar el helper con refresh automático
    return requestWithAuth<T>(endpoint, options);
  }

  // Crear una orden de platillo (dish order) en habitación
  async createDishOrder(
    restaurantId: string,
    branchNumber: string,
    roomNumber: string,
    dishOrderData: DishOrderData,
  ): Promise<ApiResponse<any>> {
    return this.request(
      `/room-orders/restaurant/${restaurantId}/branch/${branchNumber}/room/${roomNumber}/dishes`,
      {
        method: "POST",
        body: JSON.stringify(dishOrderData),
      },
    );
  }

  // Actualizar el estado de pago de una orden
  async updatePaymentStatus(
    roomOrderId: string,
    paymentStatus: "pending" | "paid" | "failed",
  ): Promise<ApiResponse<any>> {
    return this.request(`/room-orders/${roomOrderId}/payment-status`, {
      method: "PATCH",
      body: JSON.stringify({ payment_status: paymentStatus }),
    });
  }

  // Actualizar el estado de una orden
  async updateOrderStatus(
    roomOrderId: string,
    orderStatus: "pending" | "completed" | "cancelled",
  ): Promise<ApiResponse<any>> {
    return this.request(`/room-orders/${roomOrderId}/status`, {
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
  async getOrderById(orderId: string): Promise<ApiResponse<RoomOrderResponse>> {
    return this.request(`/room-orders/${orderId}`, {
      method: "GET",
    });
  }

  // Confirmar orden atómica: crea room order + dish orders + transacción en una sola llamada
  async confirmOrder(
    data: ConfirmRoomOrderData,
  ): Promise<ConfirmRoomOrderResponse> {
    try {
      return await this.request<any>("/room-orders/confirm", {
        method: "POST",
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error("Error confirming room order:", error);
      return {
        success: false,
        error: { message: "Error al confirmar la orden" },
      };
    }
  }

  // Obtener orden activa por user_id (user_id o guest_id) y restaurantId
  async getActiveOrderByUser(
    clientId: string,
    restaurantId: number,
  ): Promise<ApiResponse<ActiveOrderResponse>> {
    return this.request<ActiveOrderResponse>(
      `/room-orders/restaurant/${restaurantId}/active/user/${clientId}`,
      { method: "GET" },
    );
  }
}

export const roomOrderService = new RoomOrderService();
