"use client";

import { useCallback, useState } from "react";
import {
  createEcartPayCheckout,
  isEcartPaySDKLoaded,
  waitForEcartPaySDK,
  type EcartPayCheckoutOptions,
  type EcartPayCheckoutResult,
} from "../ecartpay";

/**
 * Estado de React alrededor del checkout de EcartPay. Misma API que el
 * `useEcartPay` de Tap Order & Pay; la lógica vive en `ecartpay.ts`.
 */
export function useEcartPay() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCheckout = useCallback(
    async (options: EcartPayCheckoutOptions): Promise<EcartPayCheckoutResult> => {
      setIsLoading(true);
      setError(null);
      try {
        return await createEcartPayCheckout(options);
      } catch (err) {
        console.error("EcartPay error:", err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const waitForSDK = useCallback(
    (timeout = 10000) => waitForEcartPaySDK(timeout),
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    isLoading,
    error,
    isSDKLoaded: isEcartPaySDKLoaded,
    createCheckout,
    waitForSDK,
    clearError,
  };
}
