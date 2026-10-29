import { requestWithAuth, type ApiResponse } from "./request-helper";

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
// `items` para reclamar. Los descuentos personales (user_discounts) se
// disfrazan de esta misma forma para reusar el modal: `personal` marca el
// origen y `personalType` distingue "% en un platillo" de "% en la cuenta"
// (este último sin items; se aplica solo al pagar).
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
  personal?: boolean;
  personalType?: "item" | "order";
  // Tipo real de la activación (promo_activations.discount_type) — una
  // promo de cuenta real (no personal) llega con items: [] igual que las
  // pseudo-activaciones personales tipo 'order'.
  discount_type?: "item" | "order";
  // Solo para discount_type='order' real (no personal): el id de la única
  // fila del batch — no hay item del que sacarlo, así que /claim lo
  // necesita expuesto acá.
  activation_id?: string;
}

// Promo QR tipo 'order' ya reclamada (claimed) por esta identidad — lo que
// el checkout usa para descontar el total antes de cobrar.
export interface ClaimedOrderPromo {
  redemptionId: string;
  batchId: string;
  discountPercentage: number;
}

class PromoActivationsService {
  async getActive(
    restaurantId: number,
    branchNumber: number,
    promoCode?: string | null,
  ): Promise<ApiResponse<PromoActivation[]>> {
    const promoParam = promoCode
      ? `&promo_code=${encodeURIComponent(promoCode)}`
      : "";
    return requestWithAuth<PromoActivation[]>(
      `/promotions/active?restaurant_id=${restaurantId}&branch_number=${branchNumber}${promoParam}`,
    );
  }

  async claim(
    activationId: string,
    restaurantId?: number | null,
    branchNumber?: number | null,
    promoCode?: string | null,
  ): Promise<
    ApiResponse<{ redemptionId: string; cartItemId: string | null }>
  > {
    return requestWithAuth<{ redemptionId: string; cartItemId: string | null }>(
      `/promotions/${activationId}/claim`,
      {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId || null,
          branch_number: branchNumber || null,
          promo_code: promoCode || null,
        }),
      },
    );
  }

  // Promo de cuenta ya reclamada para esta sucursal — usado por
  // useAccountDiscount para descontar el total antes de pagar.
  async getClaimedOrderDiscount(
    restaurantId: number,
    branchNumber: number,
  ): Promise<ApiResponse<ClaimedOrderPromo | null>> {
    return requestWithAuth<ClaimedOrderPromo | null>(
      `/promotions/claimed-order-discount?restaurant_id=${restaurantId}&branch_number=${branchNumber}`,
    );
  }
}

export const promoActivationsService = new PromoActivationsService();
