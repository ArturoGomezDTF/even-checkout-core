export const PACKAGE_NAME = "@even/payments";
export * from "./types";
export { createPaymentService, type PaymentService } from "./payment-service";
export { isDefinitiveWalletRejection } from "./wallet";
export {
  PAYMENT_INTENT_STORAGE_KEY,
  computeFingerprint,
  createPaymentIntentStore,
  generateIntentKey,
  paymentIntentStore,
  type FingerprintInput,
  type FingerprintItemInput,
  type IntentStorage,
  type PaymentIntentStore,
  type StoredPaymentIntent,
} from "./idempotency";
export {
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  pollConfirm,
  waitForChargedIntent,
  type ConfirmResponse,
  type PollOptions,
} from "./polling";
export {
  chargeSavedCard,
  getErrorCode,
  type ChargeOutcome,
  type ChargeSavedCardParams,
} from "./charge";
export {
  createEcartPayCheckout,
  isEcartPaySDKLoaded,
  normalizeEcartPayResult,
  waitForEcartPaySDK,
  type EcartPayCheckoutOptions,
  type EcartPayCheckoutResult,
  type EcartPaySDK,
} from "./ecartpay";
export {
  calculateCommissions,
  formatMXN,
  getCommissionRates,
  type CommissionBreakdown,
  type CommissionRates,
} from "./commissions";
