import type { ApiResponse } from "@even/api-client";
import type {
  FingerprintInput,
  PaymentIntentStore,
  StoredPaymentIntent,
} from "./idempotency";
import type { PaymentService } from "./payment-service";
import { waitForChargedIntent, type PollOptions } from "./polling";
import type { ProcessPaymentRequest } from "./types";

/**
 * Resultado de intentar cobrar una tarjeta guardada.
 *
 * - `charged`: hay `ecartpayOrderId`; el siguiente paso es /confirm de la app.
 * - `retryable`: hay certeza de que NO se cobró; se puede ofrecer reintentar.
 * - `unconfirmed`: sin certeza de que no se cobró — la UI NUNCA debe ofrecer
 *   volver a cobrar, solo mostrar el error terminal de confirmación.
 */
export type ChargeOutcome =
  | {
      status: "charged";
      ecartpayOrderId: string;
      intent: StoredPaymentIntent;
      // true si se reutilizó un cobro ya hecho (intent guardado o replay).
      reused: boolean;
    }
  | {
      status: "retryable";
      reason:
        | "intent_mismatch"
        | "idempotency_unavailable"
        | "payment_rejected"
        | "declined"
        | "missing_order_id";
      message?: string;
    }
  | {
      status: "unconfirmed";
      reason: "payment_unknown" | "charge_unconfirmed" | "in_progress_timeout";
    };

/** Código semántico de un error del backend, venga en la raíz o en `error`. */
export function getErrorCode(result: ApiResponse<unknown>): string | undefined {
  return (
    result.code ??
    (typeof result.error === "object" ? result.error?.code : undefined)
  );
}

function getErrorMessage(result: ApiResponse<unknown>): string | undefined {
  return typeof result.error === "object" ? result.error?.message : undefined;
}

export interface ChargeSavedCardParams {
  service: Pick<PaymentService, "processPayment" | "getPaymentIntentStatus">;
  store: PaymentIntentStore;
  /** Carrito actual; decide si se reutiliza la clave guardada o se crea otra. */
  fingerprintInput: FingerprintInput;
  /** Cuerpo de /payments sin los campos de idempotencia (los pone el flujo). */
  request: Omit<ProcessPaymentRequest, "intentKey" | "fingerprint">;
  /** Se llama al entrar al polling de "Verificando tu pago…". */
  onVerifying?: () => void;
  poll?: PollOptions;
}

/**
 * Cobro con tarjeta guardada con idempotencia. Extraído del checkout de
 * Tap Order & Pay / Room Service (card-selection), sin cambiar su semántica:
 * después de un 2xx de /payments nunca se vuelve a llamar /payments con otra
 * clave para el mismo carrito.
 */
export async function chargeSavedCard({
  service,
  store,
  fingerprintInput,
  request,
  onVerifying,
  poll,
}: ChargeSavedCardParams): Promise<ChargeOutcome> {
  const intent = await store.ensure(fingerprintInput);

  // Ya se cobró en un intento anterior: solo falta /confirm.
  if (intent.ecartpayOrderId) {
    return {
      status: "charged",
      ecartpayOrderId: intent.ecartpayOrderId,
      intent,
      reused: true,
    };
  }

  const paymentResult = await service.processPayment({
    ...request,
    intentKey: intent.intentKey,
    fingerprint: intent.fingerprint,
  });

  if (paymentResult.success) {
    // Éxito directo o replay de un intento anterior — misma forma.
    const ecartpayOrderId = paymentResult.payment?.id ?? null;
    if (!ecartpayOrderId) {
      return { status: "retryable", reason: "missing_order_id" };
    }
    store.update({ ecartpayOrderId });
    return {
      status: "charged",
      ecartpayOrderId,
      intent: { ...intent, ecartpayOrderId },
      reused: !!paymentResult.replayed,
    };
  }

  const code = getErrorCode(paymentResult);

  switch (code) {
    case "intent_mismatch":
      // El carrito cambió respecto al intento guardado — nunca se cobró con
      // estos datos. Se regenera la clave y se deja reintentar.
      store.clear();
      return { status: "retryable", reason: "intent_mismatch" };

    case "idempotency_unavailable":
      // 503 — no hubo cobro, sí es seguro reintentar en unos segundos.
      return { status: "retryable", reason: "idempotency_unavailable" };

    case "payment_in_progress": {
      // Ya hay un cobro con esta clave en curso — nunca se vuelve a llamar
      // /payments. Se espera a que resuelva.
      onVerifying?.();
      const resolvedId = await waitForChargedIntent(
        (key) => service.getPaymentIntentStatus(key),
        intent.intentKey,
        poll,
      );
      if (!resolvedId) {
        return { status: "unconfirmed", reason: "in_progress_timeout" };
      }
      store.update({ ecartpayOrderId: resolvedId });
      return {
        status: "charged",
        ecartpayOrderId: resolvedId,
        intent: { ...intent, ecartpayOrderId: resolvedId },
        reused: true,
      };
    }

    case "payment_rejected":
      // Rechazo definitivo (422): no se cobró y repetir con la misma tarjeta
      // fallaría igual. Se descarta el intento guardado para que otra tarjeta
      // no reciba el replay del rechazo.
      store.clear();
      return {
        status: "retryable",
        reason: "payment_rejected",
        message: getErrorMessage(paymentResult),
      };

    case "payment_unknown":
    case "charge_unconfirmed":
      // Sin certeza de que no se cobró — nunca se ofrece recobrar.
      return { status: "unconfirmed", reason: code };

    default:
      // card_declined / validation_error / red / etc. — certeza de que NO se
      // cobró, se puede reintentar con otra tarjeta tal cual.
      return {
        status: "retryable",
        reason: "declined",
        message: getErrorMessage(paymentResult),
      };
  }
}
