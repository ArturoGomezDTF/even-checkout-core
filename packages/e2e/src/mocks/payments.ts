import type { Page, Request, Route } from "@playwright/test";
import type { PaymentMethod } from "@even/payments";
import { E2E_API_URL } from "../config";
import { mastercardCard, visaCard } from "./data";

type Json = Record<string, unknown>;

/** Respuesta de un endpoint: un objeto JSON (200) o `{ status, body }`. */
export type MockResponse = Json | { status: number; body: Json };

export interface PaymentsApiOptions {
  apiUrl?: string;
  paymentMethods?: PaymentMethod[];
  /** Respuesta de POST /payments. Por defecto, cobro exitoso. */
  processPayment?: MockResponse;
  /** Respuesta de GET /payments/intents/:key. Por defecto, `charged`. */
  intentStatus?: MockResponse;
}

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

export interface PaymentsApiMock {
  /** Peticiones que recibió la API falsa, en orden. */
  readonly requests: RecordedRequest[];
  /** Reemplaza la respuesta de un endpoint (p.ej. `"GET /payment-methods"`) a mitad del test. */
  override(key: string, response: MockResponse): void;
}

function isStatusResponse(response: MockResponse): response is { status: number; body: Json } {
  return typeof response.status === "number" && typeof response.body === "object";
}

function fulfill(route: Route, response: MockResponse) {
  const { status, body } = isStatusResponse(response) ? response : { status: 200, body: response };
  return route.fulfill({ status, json: body });
}

function readBody(request: Request): unknown {
  try {
    return request.postDataJSON();
  } catch {
    return request.postData();
  }
}

/**
 * Mock en memoria de los endpoints de `/payment-methods` y `/payments` de
 * even-backend, con las mismas formas de respuesta que `@even/payments`.
 */
export async function mockPaymentsApi(page: Page, options: PaymentsApiOptions = {}): Promise<PaymentsApiMock> {
  const apiUrl = options.apiUrl ?? E2E_API_URL;
  let methods = [...(options.paymentMethods ?? [visaCard, mastercardCard])];
  const overrides = new Map<string, MockResponse>();
  const requests: RecordedRequest[] = [];

  const defaults = (method: string, path: string, body: unknown): MockResponse | undefined => {
    if (path === "/payment-methods" && method === "GET") {
      return { success: true, data: { paymentMethods: methods } };
    }
    if (path === "/payment-methods" && method === "POST") {
      const input = body as { cardNumber?: string; fullName?: string };
      const created: PaymentMethod = {
        id: `pm_e2e_${methods.length + 1}`,
        lastFourDigits: String(input.cardNumber ?? "").slice(-4),
        cardBrand: "visa",
        cardType: "credit",
        cardholderName: input.fullName,
        isDefault: methods.length === 0,
      };
      methods = [...methods, created];
      return { success: true, data: { paymentMethod: created } };
    }
    const methodMatch = path.match(/^\/payment-methods\/([^/]+)(\/default)?$/);
    if (methodMatch) {
      const id = decodeURIComponent(methodMatch[1]);
      if (method === "DELETE" && !methodMatch[2]) {
        methods = methods.filter((m) => m.id !== id);
        return { success: true, data: { message: "Método de pago eliminado" } };
      }
      if (method === "PUT" && methodMatch[2]) {
        methods = methods.map((m) => ({ ...m, isDefault: m.id === id }));
        return { success: true, data: { message: "Método de pago predeterminado actualizado" } };
      }
    }
    if (path === "/payments" && method === "POST") {
      return (
        options.processPayment ?? {
          success: true,
          data: { payment: { id: "pay_e2e_1", status: "charged" } },
          payment: { id: "pay_e2e_1", status: "charged" },
        }
      );
    }
    if (path.startsWith("/payments/intents/") && method === "GET") {
      return options.intentStatus ?? { success: true, status: "charged", ecartpay_order_id: "ecart_e2e_1" };
    }
    if (path === "/payments/installment-config" && method === "GET") {
      return { success: true, data: { isActive: false, visaMc: [], amex: [] } };
    }
    if (path === "/payments/history" && method === "GET") {
      return { success: true, data: [] };
    }
    return undefined;
  };

  await page.route(
    (url) => url.href.startsWith(`${apiUrl}/payment-methods`) || url.href.startsWith(`${apiUrl}/payments`),
    async (route, request) => {
      const method = request.method();
      if (method === "OPTIONS") {
        return route.fulfill({ status: 204 });
      }
      const path = new URL(request.url()).pathname;
      const body = readBody(request);
      requests.push({ method, path, body });

      const response = overrides.get(`${method} ${path}`) ?? defaults(method, path, body);
      if (response) return fulfill(route, response);
      // Deja pasar al guard de red, que marca el endpoint como no mockeado.
      return route.fallback();
    },
  );

  return {
    requests,
    override(key, response) {
      overrides.set(key, response);
    },
  };
}
