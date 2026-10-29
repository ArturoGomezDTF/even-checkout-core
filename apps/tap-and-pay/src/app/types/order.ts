export interface DishOrder {
  id: string;
  item: string;
  quantity: number;
  price: number;
  extra_price: number;
  total_price: number;
  status: "preparing" | "ready" | "delivered";
  payment_status: "not_paid" | "paid";
  images: string[];
  custom_fields: Record<string, any>;
}

export interface TapPayOrder {
  order_id: string;
  table_number: string;
  restaurant_id: number;
  branch_number: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: "pending" | "partial" | "paid";
  order_status:
    | "active"
    | "confirmed"
    | "preparing"
    | "ready"
    | "completed"
    | "cancelled"
    | "abandoned";
  is_split_active: boolean;
  split_method?: "equal-shares" | "select-items" | "choose-amount";
  number_of_splits?: number;
  created_at: string;
  updated_at?: string;
  items: DishOrder[];
}

export interface PaymentTransaction {
  id: string;
  id_tap_pay_order: string;
  total_amount_charged: number;
  tip_amount: number;
  payment_method_id: string;
  created_at: string;
}

export interface ActiveUser {
  id: string;
  table_order_id: string;
  user_id?: string;
  guest_name?: string;
  amount_paid: number;
  created_at: string;
}
