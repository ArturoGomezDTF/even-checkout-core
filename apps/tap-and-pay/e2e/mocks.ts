import { mockPaymentsApi, type MockResponse, type PaymentsApiOptions } from "@even/e2e";
import type { Page } from "@playwright/test";

/**
 * Tap & Pay saca el host del socket quitando el sufijo /api de
 * NEXT_PUBLIC_API_URL, así que la API falsa lo lleva. https porque el CSP
 * incluye upgrade-insecure-requests.
 */
export const API_URL = "https://backend.e2e.test/api";

export const RESTAURANT_ID = 5;
export const BRANCH_NUMBER = 2;
export const TABLE = "1";
export const ORDER_ID = "order_e2e_1";
export const ORDER_URL = `/${RESTAURANT_ID}/${BRANCH_NUMBER}/order?table=${TABLE}`;

/** Cuenta completa de $360 sin propina: 2 × Tacos al pastor de $180. */
export const CARD_SELECTION_URL =
  `/${RESTAURANT_ID}/${BRANCH_NUMBER}/card-selection?table=${TABLE}` +
  "&type=full-bill&amount=360&baseAmount=360&tipAmount=0";

const now = "2026-10-01T12:00:00.000Z";

export const restaurant = {
  id: RESTAURANT_ID,
  name: "Tacos E2E",
  logo_url: null,
  is_active: true,
  created_at: now,
  updated_at: now,
};

const dish = (id: string, item: string, price: number, quantity: number, paid = false) => ({
  id,
  item,
  quantity,
  price,
  extra_price: 0,
  total_price: price * quantity,
  status: "preparing",
  payment_status: paid ? "paid" : "not_paid",
  images: [],
  custom_fields: {},
});

export const tacosAlPastor = dish("dish_e2e_1", "Tacos al pastor", 180, 2);

export const tapPayOrder = {
  order_id: ORDER_ID,
  table_number: TABLE,
  restaurant_id: RESTAURANT_ID,
  branch_number: BRANCH_NUMBER,
  total_amount: 360,
  paid_amount: 0,
  remaining_amount: 360,
  payment_status: "pending",
  order_status: "active",
  is_split_active: false,
  created_at: now,
  items: [tacosAlPastor],
};

export interface TapAndPayApiOptions {
  /** Orden de la mesa; null simula una mesa sin cuenta abierta. */
  order?: typeof tapPayOrder | null;
  /** Respuesta al crear la orden de Apple/Google Pay. Por defecto, un 503 pasajero. */
  walletOrder?: MockResponse;
  payments?: Omit<PaymentsApiOptions, "apiUrl">;
}

/**
 * Mock de los endpoints de even-backend que usa Tap & Pay: los de pagos con
 * `mockPaymentsApi` y el resto (restaurante, cuenta de la mesa, usuarios
 * activos) aquí. Lo que no tenga mock lo aborta el guard de red de `@even/e2e`.
 */
export async function mockTapAndPayApi(
  page: Page,
  { order = tapPayOrder, walletOrder, payments }: TapAndPayApiOptions = {},
) {
  const wallet = walletOrder ?? { status: 503, body: { success: false, error: "Servicio no disponible" } };

  const responses: Array<[string, RegExp, MockResponse]> = [
    ["GET", /^\/restaurants\/\d+\/\d+\/complete$/, { success: true, data: { restaurant } }],
    ["GET", /^\/tap-pay\/restaurants\/\d+\/branches\/\d+\/tables\/[^/]+\/order$/, { success: true, data: order }],
    ["GET", /^\/tap-pay\/orders\/[^/]+\/active-users$/, { success: true, data: [] }],
    ["POST", /^\/tap-pay\/orders\/[^/]+\/active-users$/, { success: true, data: {} }],
    ["GET", /^\/tap-pay\/orders\/[^/]+\/split-status$/, { success: true, data: { is_split_active: false } }],
    ["GET", /^\/tap-pay\/orders\/[^/]+\/items$/, { success: true, data: order?.items ?? [] }],
    ["POST", /^\/payments\/(apple|google)-pay\/order$/, wallet],
  ];

  // El layout carga el SDK de EcartPay; un stub vacío basta para el humo.
  await page.route("https://pay.ecart.com/sdk/pay.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  // Socket.IO reintenta solo; sin servidor la app sigue funcionando por HTTP.
  await page.route("https://backend.e2e.test/socket.io/**", (route) => route.fulfill({ status: 503 }));

  // Apple Pay solo se inicializa si el navegador expone ApplePaySession.
  await page.addInitScript(() => {
    (window as unknown as { ApplePaySession: unknown }).ApplePaySession = { canMakePayments: () => true };
  });

  await page.route(`${API_URL}/**`, (route, request) => {
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const match = responses.find(([method, re]) => method === request.method() && re.test(path));
    // Lo demás sigue a los mocks de pagos y al guard de red.
    if (!match) return route.fallback();
    const response = match[2];
    return typeof response.status === "number" && typeof response.body === "object"
      ? route.fulfill({ status: response.status, json: response.body })
      : route.fulfill({ json: response });
  });

  // Se registra después para que tenga prioridad sobre las rutas de arriba.
  return mockPaymentsApi(page, { ...payments, apiUrl: API_URL });
}
