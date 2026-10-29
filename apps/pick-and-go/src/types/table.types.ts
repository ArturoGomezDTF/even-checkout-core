/**
 * Tipos relacionados con mesas y órdenes
 */

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
  guest_name: string;
  total_paid_individual: number;
  total_paid_amount: number;
  total_paid_split: number;
  is_in_split: boolean;
  updated_at: string;
}

export interface SplitPayment {
  user_id?: string;
  guest_name: string;
  expected_amount: number;
  amount_paid: number;
  status: "pending" | "paid";
  remaining: number;
  paid_at?: string;
}

export interface CreateDishOrderRequest {
  userId: string | null;
  guestName: string;
  item: string;
  quantity: number;
  price: number;
  guestId?: string | null;
  images?: string[];
  customFields?: Array<{
    fieldId: string;
    fieldName: string;
    selectedOptions: Array<{
      optionId: string;
      optionName: string;
      price: number;
    }>;
  }>;
  extraPrice?: number;
}
