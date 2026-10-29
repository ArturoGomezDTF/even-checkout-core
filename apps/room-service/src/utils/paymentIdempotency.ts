// Idempotencia de cobro: la implementación vive en @even/payments.
import { paymentIntentStore, type FingerprintInput, type StoredPaymentIntent } from "@even/payments";

export {
  computeFingerprint,
  generateIntentKey,
  type FingerprintInput,
  type FingerprintItemInput,
  type StoredPaymentIntent,
} from "@even/payments";

export const getStoredPaymentIntent = () => paymentIntentStore.get();
export const savePaymentIntent = (intent: StoredPaymentIntent) => paymentIntentStore.save(intent);
export const updateStoredPaymentIntent = (patch: Partial<StoredPaymentIntent>) =>
  paymentIntentStore.update(patch);
/** Solo se borra cuando la orden queda confirmada — nunca antes. */
export const clearStoredPaymentIntent = () => paymentIntentStore.clear();
export const ensurePaymentIntent = (input: FingerprintInput) => paymentIntentStore.ensure(input);
