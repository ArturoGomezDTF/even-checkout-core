// Tipos y helpers del SDK de EcartPay (`window.Pay.Checkout`).

export interface EcartPayCheckoutOptions {
  publicID: string;
  order: {
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
    currency: string;
    items: Array<{
      name: string;
      price: number;
      quantity: number;
    }>;
    shipping?: {
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };
  };
  successUrl?: string;
  cancelUrl?: string;
  failureUrl?: string;
  onSuccess?: (result: unknown) => void;
  onError?: (error: unknown) => void;
  onCancel?: () => void;
}

export interface EcartPayCheckoutResult {
  success: boolean;
  payment?: {
    id: string;
    status: string;
    amount: number;
    currency: string;
  };
  order?: {
    id: string;
    status: string;
  };
  error?: {
    message: string;
    code: string;
  };
}

export interface EcartPaySDK {
  Checkout: {
    create(options: EcartPayCheckoutOptions): Promise<unknown>;
  };
}

declare global {
  interface Window {
    Pay?: EcartPaySDK;
  }
}

function getSDK(): EcartPaySDK | undefined {
  if (typeof window === "undefined") return undefined;
  return window.Pay?.Checkout ? window.Pay : undefined;
}

export function isEcartPaySDKLoaded(): boolean {
  return !!getSDK();
}

/** Espera a que el script del SDK cargue; resuelve false al agotar el tiempo. */
export function waitForEcartPaySDK(
  timeout = 10000,
  isLoaded: () => boolean = isEcartPaySDKLoaded,
): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const check = () => {
      if (isLoaded()) {
        resolve(true);
      } else if (Date.now() - startTime > timeout) {
        resolve(false);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

function itemsTotal(options: EcartPayCheckoutOptions): number {
  return options.order.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
}

/**
 * Normaliza los distintos formatos que devuelve `Pay.Checkout.create`.
 * Lanza si el SDK reporta error explícito o si el formato es irreconocible.
 */
export function normalizeEcartPayResult(
  result: unknown,
  options: EcartPayCheckoutOptions,
): EcartPayCheckoutResult {
  if (result && typeof result === "object") {
    const resultObj = result as Record<string, unknown> & {
      success?: boolean;
      error?: { message?: string };
      payment?: EcartPayCheckoutResult["payment"];
      order?: EcartPayCheckoutResult["order"];
      id?: string;
    };

    if ("success" in resultObj) {
      if (!resultObj.success) {
        throw new Error(resultObj.error?.message || "Payment failed");
      }
      return resultObj as EcartPayCheckoutResult;
    }

    if ("payment" in resultObj || "order" in resultObj || "id" in resultObj) {
      return {
        success: true,
        payment: resultObj.payment || {
          id: resultObj.id || "unknown",
          status: "completed",
          amount: itemsTotal(options),
          currency: options.order.currency,
        },
        order: resultObj.order,
      };
    }

  }

  // Formato inesperado: sin error explícito se trata como éxito (mismo
  // comportamiento que el useEcartPay original de las apps).
  if (result && !(result as { error?: unknown }).error) {
    console.warn("Unexpected EcartPay result format:", result);
    return {
      success: true,
      payment: {
        id: `ecartpay-${Date.now()}`,
        status: "completed",
        amount: itemsTotal(options),
        currency: options.order.currency,
      },
    };
  }

  throw new Error("Payment failed: Unexpected response format");
}

/** Abre el checkout de EcartPay y devuelve el resultado normalizado. */
export async function createEcartPayCheckout(
  options: EcartPayCheckoutOptions,
): Promise<EcartPayCheckoutResult> {
  const sdk = getSDK();
  if (!sdk) {
    throw new Error("EcartPay SDK not loaded. Please refresh the page.");
  }
  const result = await sdk.Checkout.create(options);
  return normalizeEcartPayResult(result, options);
}
