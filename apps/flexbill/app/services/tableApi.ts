// ===============================================
// PREVIOUS IMPLEMENTATION (COMMENTED OUT)
// User-based orders system - replaced with dish-based system
// ===============================================

// ===============================================
// NEW IMPLEMENTATION - DISH-BASED SYSTEM
// ===============================================

// New types based on the backend service
export interface DishOrder {
  dish_order_id: string;
  item: string;
  quantity: number;
  price: number;
  total_price: number;
  status: "pending" | "preparing" | "ready" | "delivered";
  payment_status: "not_paid" | "paid";
  user_id?: string;
  guest_name: string;
  table_order_id: string;
  images: string[];
  custom_fields?: any;
  extra_price?: number;
}

export interface TableSummary {
  restaurant_id: number;
  table_number: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  no_items: number;
  status: "not_paid" | "partial" | "paid";
}

export interface ActiveUser {
  restaurant_id: number;
  table_number: number;
  user_id?: string;
  guest_id?: string;
  guest_name: string;
  total_paid_individual: number;
  total_paid_amount: number;
  updated_at: string;
}

// ===============================================
// NEW TABLE API SERVICE - DISH-BASED SYSTEM
// ===============================================

// IMPORTANT: All table API functionality has been moved to utils/api.ts
// This file now only exports types for backward compatibility

// Re-export apiService as the new table API
import { apiService } from "../utils/api";

// Export the main API service
export { apiService as tableApi };

// Legacy compatibility - redirect old tableApi usage to new apiService
export const legacyTableApi = {
  // Deprecated: use apiService.getTableOrders(restaurantId, branchNumber, tableNumber) instead
  getTableOrders: (_tableNumber: number) => {
    throw new Error(
      "legacyTableApi.getTableOrders is deprecated. Use apiService.getTableOrders(restaurantId, branchNumber, tableNumber) instead.",
    );
  },

  // Deprecated: use apiService.createDishOrder() instead
  createUserOrder: (tableNumber: number, orderData: any) =>
    console.warn(
      "createUserOrder is deprecated. Use submitOrder from TableContext instead.",
    ),

  // Add other legacy methods as needed for backward compatibility
};
