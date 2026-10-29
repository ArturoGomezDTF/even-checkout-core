import type { ApiResponse } from "./cartApi";
import type { ActivationMenuItem } from "./promoActivations.service";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

// Descuento personal (TK-0078): asignado desde el main portal a ESTE
// usuario registrado, un solo uso. FlexBill solo maneja los de tipo
// 'item' (los de tipo 'order' requieren el recompute del ledger de la
// mesa y aún no aplican aquí).
// Personalización preconfigurada por el admin al asignar el descuento
// (formato cart_items.custom_fields): el platillo entra al carrito con
// este detalle al reclamar.
export interface UserDiscountCustomField {
  fieldId: string;
  fieldName: string;
  fieldType?: string;
  selectedOptions: Array<{
    optionId: string;
    optionName: string;
    price: number;
    quantity?: number;
  }>;
}

export interface UserDiscount {
  id: string;
  restaurant_id: number;
  service: string | null;
  discount_type: "item" | "order";
  menu_item_id: number | null;
  discount_percentage: number;
  starts_at: string;
  ends_at: string | null;
  status: "assigned" | "claimed";
  claimed_at: string | null;
  menu_items: ActivationMenuItem | null;
  custom_fields?: UserDiscountCustomField[] | null;
}

// "ESPRESSO" + "16 oz" → "ESPRESSO · 16 oz" para mostrar en el modal
export function userDiscountDetailSuffix(d: UserDiscount): string {
  const detail = (d.custom_fields || [])
    .flatMap((f) =>
      (f.selectedOptions || []).map((o) =>
        (o.quantity ?? 1) > 1 ? `${o.optionName} x${o.quantity}` : o.optionName,
      ),
    )
    .join(", ");
  return detail ? ` · ${detail}` : "";
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("even_access_token");
}

async function request<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  try {
    const authToken = getAuthToken();
    if (!authToken) {
      // Sin sesión no hay descuentos personales — corto sin pegarle al API
      return { success: true, data: [] as T };
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        ...(options?.headers as Record<string, string>),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "API request failed");
    }

    return data;
  } catch (error) {
    console.error("User Discounts API Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

class UserDiscountsService {
  async getActive(restaurantId: number): Promise<ApiResponse<UserDiscount[]>> {
    return request<UserDiscount[]>(
      `/user-discounts/active?restaurant_id=${restaurantId}&service=flex-bill`,
    );
  }

  async claim(
    discountId: string,
    restaurantId?: number | null,
    branchNumber?: number | null,
  ): Promise<ApiResponse<{ discount: UserDiscount; cartItemId: string }>> {
    return request<{ discount: UserDiscount; cartItemId: string }>(
      `/user-discounts/${discountId}/claim`,
      {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId || null,
          branch_number: branchNumber || null,
          add_to_cart: true,
        }),
      },
    );
  }
}

export const userDiscountsService = new UserDiscountsService();
