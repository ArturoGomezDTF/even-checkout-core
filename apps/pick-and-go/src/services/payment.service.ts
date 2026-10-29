import { createPaymentService } from "@even/payments";
import { requestWithAuth } from "./request-helper";

export type { ApiResponse } from "@even/api-client";
export {
  isDefinitiveWalletRejection,
  type AddPaymentMethodRequest,
  type CartItemForPayment,
  type PaymentHistory,
  type PaymentIntentStatus,
  type PaymentIntentStatusResponse,
  type PaymentMethod,
  type ProcessPaymentRequest,
} from "@even/payments";

export const paymentService = createPaymentService(requestWithAuth);
