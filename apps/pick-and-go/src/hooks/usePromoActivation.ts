import { useCallback, useEffect, useState } from "react";
import {
  promoActivationsService,
  promoItemDetailSuffix,
  type PromoActivation,
} from "@/services/promoActivations.service";
import {
  userDiscountsService,
  userDiscountDetailSuffix,
  type UserDiscount,
} from "@/services/userDiscounts.service";
import { useRestaurant } from "@/context/RestaurantContext";
import { useBranch } from "@/context/BranchContext";
import { useAuth } from "@/context/AuthContext";
import { getStoredPromoCode } from "@/utils/promoCode";

// Persistente (no solo de sesión): una vez reclamada de verdad, no se vuelve
// a mostrar. Cerrar el modal sin reclamar NO se guarda aquí — a propósito,
// para que reaparezca en el próximo reload mientras siga sin reclamarse.
const claimedKey = (batchId: string) => `even-promo-claimed-${batchId}`;

// Módulo en memoria (no localStorage/sessionStorage): sobrevive la
// navegación cliente entre rutas, pero se resetea solo en un reload real.
const shownThisPageLoad = new Set<string>();

// Un descuento personal se disfraza de activación para reusar el modal:
// batch "ud-<id>", items[0].id = id del descuento (lo que se manda al
// claim). Tipo 'order' va sin items — el modal muestra la card de "% en
// tu cuenta" y al pagar se aplica solo.
const toPseudoActivation = (
  d: UserDiscount,
  restaurantId: number,
  branchNumber: number,
): PromoActivation => ({
  batch_id: `ud-${d.id}`,
  branch_id: "",
  restaurant_id: restaurantId,
  branch_number: branchNumber,
  user_type_filter: "authenticated",
  discount_percentage: d.discount_percentage,
  starts_at: d.starts_at,
  ends_at: d.ends_at ?? "",
  status: "active",
  items:
    d.discount_type === "item"
      ? [
          {
            id: d.id,
            menu_item_id: d.menu_item_id as number,
            // El nombre lleva la personalización preconfigurada (ej.
            // "· 16 oz") para que el comensal sepa qué está reclamando
            menu_items: d.menu_items
              ? {
                  ...d.menu_items,
                  name: d.menu_items.name + userDiscountDetailSuffix(d),
                }
              : null,
          },
        ]
      : [],
  personal: true,
  personalType: d.discount_type,
});

export function usePromoActivation() {
  const { restaurantId } = useRestaurant();
  const { selectedBranchNumber } = useBranch();
  const branchNumber = selectedBranchNumber ?? null;
  const { isAuthenticated } = useAuth();

  const [activations, setActivations] = useState<PromoActivation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isClaimed = (batchId: string) =>
    typeof window !== "undefined" &&
    !!localStorage.getItem(claimedKey(batchId));

  const refresh = useCallback(async () => {
    if (!restaurantId || !branchNumber) {
      setActivations([]);
      return;
    }
    setIsLoading(true);
    const promoCode = getStoredPromoCode(restaurantId, branchNumber);
    try {
      // Promos de sucursal + descuentos personales (estos últimos solo con
      // sesión) en paralelo — los personales van primero en el carrusel.
      const [promosResponse, personalResponse] = await Promise.all([
        promoActivationsService.getActive(restaurantId, branchNumber, promoCode),
        isAuthenticated
          ? userDiscountsService.getActive(restaurantId)
          : Promise.resolve({ success: true, data: [] as UserDiscount[] }),
      ]);

      // 'item' (descuento de producto) ya no se reclama en este
      // modal — se ve directo en el precio del producto (usePersonalItemDiscounts)
      // y se aplica solo al agregarlo al carrito. Sólo 'order' sigue este flujo.
      const personal =
        personalResponse.success && personalResponse.data
          ? personalResponse.data
              .filter((d) => d.status === "assigned" && d.discount_type === "order")
              .map((d) => toPseudoActivation(d, restaurantId, branchNumber))
          : [];

      // Los items del batch llevan en el nombre su personalización
      // preconfigurada (ej. "· 16 oz") para que se vea al elegir cuál reclamar
      const promos = (
        promosResponse.success && promosResponse.data ? promosResponse.data : []
      ).map((a) => ({
        ...a,
        items: a.items.map((it) =>
          it.menu_items
            ? {
                ...it,
                menu_items: {
                  ...it.menu_items,
                  name: it.menu_items.name + promoItemDetailSuffix(it),
                },
              }
            : it,
        ),
      }));

      const eligible = [...personal, ...promos].filter(
        (a) => !isClaimed(a.batch_id) && !shownThisPageLoad.has(a.batch_id),
      );
      setActivations(eligible);
    } catch (error) {
      console.error("Error fetching active promotions:", error);
      setActivations([]);
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId, branchNumber, isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cierra el modal completo y marca TODAS las que seguían sin reclamarse
  // como "ya mostradas" solo en memoria — reaparecen en el próximo reload
  // real si siguen sin reclamarse.
  const dismissAll = useCallback(() => {
    setActivations((current) => {
      current.forEach((a) => shownThisPageLoad.add(a.batch_id));
      return [];
    });
  }, []);

  // Tras un reclamo exitoso: el batch deja de mostrarse para siempre
  // (persiste en localStorage).
  const markClaimed = useCallback((batchId: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(claimedKey(batchId), "1");
    }
    setActivations((current) =>
      current.filter((a) => a.batch_id !== batchId),
    );
  }, []);

  return {
    activations,
    isLoading,
    isAuthenticated,
    restaurantId,
    branchNumber,
    promoCode: getStoredPromoCode(restaurantId, branchNumber),
    refresh,
    dismissAll,
    markClaimed,
  };
}
