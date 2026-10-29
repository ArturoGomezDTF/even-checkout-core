export type PaymentType = "full-bill" | "select-items" | "equal-shares" | "choose-amount";

export interface PaymentOption {
  type: PaymentType;
  title: string;
  description: string;
  icon: string;
}

export interface PaymentMethod {
  id: string;
  card_type: string;
  last_four: string;
  card_brand: string;
  is_default: boolean;
}

export interface PaymentRequest {
  orderId: string;
  paymentType: PaymentType;
  amount?: number;
  tipAmount: number;
  paymentMethodId: string;
  selectedItems?: string[];
  userId?: string;
  guestName?: string;
}

export interface PaymentResult {
  success: boolean;
  transaction_id?: string;
  amount_paid?: number;
  remaining_amount?: number;
  error?: string;
}
