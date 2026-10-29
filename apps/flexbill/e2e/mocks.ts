import { mockPaymentsApi, type MockResponse, type PaymentsApiOptions } from "@even/e2e";
import type { Page } from "@playwright/test";

/**
 * FlexBill quita el sufijo /api de NEXT_PUBLIC_API_URL para armar el CSP y
 * algunas URLs, así que la API falsa lo lleva. https porque el CSP incluye
 * upgrade-insecure-requests.
 */
export const API_URL = "https://backend.e2e.test/api";

export const RESTAURANT_ID = 4;
export const BRANCH_NUMBER = 1;
export const TABLE = "12";
export const SESSION = "e2e-table-session";
const TABLE_QUERY = `table=${TABLE}&session=${SESSION}`;
export const MENU_URL = `/${RESTAURANT_ID}/${BRANCH_NUMBER}/menu?${TABLE_QUERY}`;
export const PAYMENT_OPTIONS_URL = `/${RESTAURANT_ID}/${BRANCH_NUMBER}/payment-options?${TABLE_QUERY}`;

/** Pagar la cuenta completa de la mesa: $360 de consumo sin propina ni comisión. */
export const CARD_SELECTION_URL =
  `/${RESTAURANT_ID}/${BRANCH_NUMBER}/card-selection?${TABLE_QUERY}` +
  "&type=full-bill&amount=360&baseAmount=360&tipAmount=0&displaySubtotal=360&displayPropina=0";

export const TABLE_ORDER_ID = "to_e2e_1";

const now = "2026-10-01T12:00:00.000Z";

export const restaurant = {
  id: RESTAURANT_ID,
  user_id: 1,
  name: "Restaurante E2E",
  description: "Flex Bill de prueba",
  logo_url: null,
  banner_url: null,
  address: null,
  phone: null,
  email: null,
  is_active: true,
  created_at: now,
  updated_at: now,
};

export const clubSandwich = {
  id: 101,
  section_id: 10,
  name: "Club sándwich",
  description: "Pollo, tocino y aguacate",
  image_url: null,
  price: 180,
  discount: 0,
  custom_fields: [],
  is_available: true,
  display_order: 1,
  created_at: now,
  updated_at: now,
};

const menu = [
  {
    id: 10,
    name: "Desayunos",
    is_active: true,
    display_order: 1,
    restaurant_id: RESTAURANT_ID,
    created_at: now,
    updated_at: now,
    items: [clubSandwich],
  },
];

/** Dos club sándwich sin pagar en la mesa: $360. */
export const dishOrders = [1, 2].map((n) => ({
  dish_order_id: `do_e2e_${n}`,
  menu_item_id: clubSandwich.id,
  item: clubSandwich.name,
  quantity: 1,
  price: clubSandwich.price,
  total_price: clubSandwich.price,
  display_price: clubSandwich.price,
  total_display_price: clubSandwich.price,
  status: "pending",
  payment_status: "not_paid",
  guest_id: null,
  guest_name: "Ana",
  table_order_id: TABLE_ORDER_ID,
  images: [],
}));

export interface FlexBillApiOptions {
  /** Respuesta al crear la orden de Apple/Google Pay. Por defecto, un 503 pasajero. */
  walletOrder?: MockResponse;
  payments?: Omit<PaymentsApiOptions, "apiUrl">;
}

/**
 * Mock de los endpoints de even-backend que usa FlexBill: los de pagos con
 * `mockPaymentsApi` y el resto (validación de mesa, menú, cuenta de la mesa,
 * POS) aquí. Lo que no tenga mock lo aborta el guard de red de `@even/e2e`.
 */
export async function mockFlexBillApi(page: Page, { walletOrder, payments }: FlexBillApiOptions = {}) {
  const wallet = walletOrder ?? { status: 503, body: { success: false, error: "Servicio no disponible" } };
  const tablePath = String.raw`\/restaurants\/\d+\/branches\/\d+\/tables\/[^/]+`;

  const responses: Array<[string, RegExp, MockResponse]> = [
    ["GET", /^\/restaurants\/\d+\/\d+\/[^/]+\/validate$/, { success: true, data: { valid: true } }],
    ["GET", /^\/restaurants\/\d+\/\d+\/complete$/, { success: true, data: { restaurant, menu } }],
    [
      "GET",
      new RegExp(`^${tablePath}\\/summary$`),
      {
        success: true,
        data: {
          restaurant_id: RESTAURANT_ID,
          branch_number: BRANCH_NUMBER,
          table_number: TABLE,
          total_amount: 360,
          paid_amount: 0,
          remaining_amount: 360,
          no_items: 2,
          status: "not_paid",
        },
      },
    ],
    ["GET", new RegExp(`^${tablePath}\\/orders$`), { success: true, data: dishOrders }],
    ["GET", new RegExp(`^${tablePath}\\/active-users$`), { success: true, data: [] }],
    ["GET", new RegExp(`^${tablePath}\\/equal-split-selection$`), { success: true, data: null }],
    // Sin POS integrado: el pedido no depende de un agente conectado.
    [
      "GET",
      /^\/pos\/restaurant\/\d+\/branch\/\d+\/agent-status$/,
      { hasIntegration: false, isActive: false, requiresAgent: false },
    ],
    // Carrito de pedidos a la mesa: vacío (Flex Bill cobra la cuenta, no el carrito).
    ["GET", /^\/cart$/, { success: true, data: { cart_id: null, items: [], total_items: 0, total_amount: 0 } }],
    ["GET", /^\/promotions\/active$/, { success: true, data: [] }],
    ["GET", /^\/payment-providers\/resolve\/\d+$/, { provider: "ecartpay" }],
    // Tras un cobro exitoso: registra la transacción y abona a la cuenta de la mesa.
    ["POST", /^\/payment-transactions$/, { success: true, data: { id: "pt_e2e_1" } }],
    ["POST", new RegExp(`^${tablePath}\\/pay$`), { success: true, data: {} }],
    ["POST", /^\/payments\/(apple|google)-pay\/order$/, wallet],
  ];

  // El layout carga el SDK de EcartPay; un stub vacío basta para el humo.
  await page.route("https://pay.ecart.com/sdk/pay.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  // Socket.IO cuelga de la raíz del backend, no de /api. Sin tiempo real, la app sigue por HTTP.
  await page.route("https://backend.e2e.test/socket.io/**", (route) => route.fulfill({ status: 404, body: "" }));

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
