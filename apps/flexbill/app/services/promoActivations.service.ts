import type { ApiResponse } from "./cartApi";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

export interface ActivationMenuItem {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
}

// Un platillo dentro del batch — id es el id de SU fila propia en
// promo_activations (lo que se manda a /claim), distinto de batch_id.
// custom_fields = personalización PRECONFIGURADA por el admin (ej. "16 oz"):
// al reclamar, el platillo entra al carrito con ese detalle.
export interface PromoActivationItem {
  id: string;
  menu_item_id: number;
  menu_items: ActivationMenuItem | null;
  custom_fields?: Array<{
    fieldId: string;
    fieldName: string;
    selectedOptions: Array<{
      optionId: string;
      optionName: string;
      price: number;
      quantity?: number;
    }>;
  }> | null;
}

// "ESPRESSO" + "16 oz" → "ESPRESSO · 16 oz" para mostrar en el modal
export function promoItemDetailSuffix(item: PromoActivationItem): string {
  const detail = (item.custom_fields || [])
    .flatMap((f) =>
      (f.selectedOptions || []).map((o) =>
        (o.quantity ?? 1) > 1 ? `${o.optionName} x${o.quantity}` : o.optionName,
      ),
    )
    .join(", ");
  return detail ? ` · ${detail}` : "";
}

// Una promo tal como la ve el comensal: un batch de 1 o más platillos
// dados de alta juntos (mismo descuento/fechas/filtro) — elige uno de
// `items` para reclamar.
export interface PromoActivation {
  batch_id: string;
  branch_id: string;
  restaurant_id: number;
  branch_number: number;
  user_type_filter: "all" | "authenticated" | "guest";
  discount_percentage: number;
  starts_at: string;
  ends_at: string;
  status: string;
  items: PromoActivationItem[];
  // true = descuento personal (user_discounts) disfrazado de activación
  // para reusar el mismo modal; su items[0].id es el id del descuento y
  // el claim va a /user-discounts en vez de /promotions.
  personal?: boolean;
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("even_access_token");
}

function getGuestId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("even-guest-id") || "";
}

async function request<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    };

    const authToken = getAuthToken();
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    } else {
      const guestId = getGuestId();
      if (guestId) headers["x-guest-id"] = guestId;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "API request failed");
    }

    return data;
  } catch (error) {
    console.error("Promo Activations API Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

class PromoActivationsService {
  async getActive(
    restaurantId: number,
    branchNumber: number,
  ): Promise<ApiResponse<PromoActivation[]>> {
    return request<PromoActivation[]>(
      `/promotions/active?restaurant_id=${restaurantId}&branch_number=${branchNumber}`,
    );
  }

  async claim(
    activationId: string,
    restaurantId?: number | null,
    branchNumber?: number | null,
  ): Promise<ApiResponse<{ redemptionId: string; cartItemId: string }>> {
    return request<{ redemptionId: string; cartItemId: string }>(
      `/promotions/${activationId}/claim`,
      {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId || null,
          branch_number: branchNumber || null,
        }),
      },
    );
  }
}

export const promoActivationsService = new PromoActivationsService();
