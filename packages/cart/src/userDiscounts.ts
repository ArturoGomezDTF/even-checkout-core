import {
  AUTH_TOKEN_STORAGE_KEY,
  type ApiResponse,
  type Requester,
} from "@even/api-client";
import type { ActivationMenuItem } from "./promoActivations";

// Descuento personal (TK-0078): asignado desde el main portal a ESTE
// usuario registrado, un solo uso. 'item' = % en un platillo (al
// reclamar entra al carrito con precio descontado calculado en el
// servidor); 'order' = % sobre la cuenta (al reclamar queda armado y se
// aplica solo al pagar).
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

function hasSession(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

/**
 * `service` es como se identifica el frontend ante el backend de descuentos
 * personales (columna user_discounts.service), p. ej. "room-service".
 */
export function createUserDiscountsService(
  request: Requester,
  service: string,
) {
  return {
    async getActive(restaurantId: number): Promise<ApiResponse<UserDiscount[]>> {
      // Sin sesión no hay descuentos personales — corto sin pegarle al API
      if (!hasSession()) return { success: true, data: [] };
      return request<UserDiscount[]>(
        `/user-discounts/active?restaurant_id=${restaurantId}&service=${service}`,
      );
    },

    async claim(
      discountId: string,
      restaurantId: number | null,
      branchNumber: number | null,
      addToCart: boolean,
    ): Promise<
      ApiResponse<{ discount: UserDiscount; cartItemId: string | null }>
    > {
      return request<{ discount: UserDiscount; cartItemId: string | null }>(
        `/user-discounts/${discountId}/claim`,
        {
          method: "POST",
          body: JSON.stringify({
            restaurant_id: restaurantId || null,
            branch_number: branchNumber || null,
            add_to_cart: addToCart,
          }),
        },
      );
    },
  };
}

export type UserDiscountsService = ReturnType<typeof createUserDiscountsService>;
