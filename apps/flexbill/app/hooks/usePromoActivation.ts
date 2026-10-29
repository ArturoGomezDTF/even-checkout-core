import { useCallback, useEffect, useState } from "react";
import {
  promoActivationsService,
  promoItemDetailSuffix,
  type PromoActivation,
} from "../services/promoActivations.service";
import {
  userDiscountsService,
  userDiscountDetailSuffix,
  type UserDiscount,
} from "../services/userDiscounts.service";
import { useRestaurant } from "../context/RestaurantContext";
import { useAuth } from "../context/AuthContext";

// Un descuento personal se disfraza de activación para reusar el modal:
// items[0].id = id del descuento (lo que se manda al claim), batch_id
// con prefijo "ud-" para que no choque con batches reales en el
// localStorage de reclamados. Solo tipo 'item' sin reclamar — los de
// tipo 'order' no aplican en FlexBill todavía y los 'claimed' ya
// viven en el carrito.
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
  items: [
    {
      id: d.id,
      menu_item_id: d.menu_item_id as number,
      // El nombre lleva la personalización preconfigurada (ej. "· 16 oz")
      // para que el comensal sepa exactamente qué está reclamando
      menu_items: d.menu_items
        ? { ...d.menu_items, name: d.menu_items.name + userDiscountDetailSuffix(d) }
        : null,
    },
  ],
  personal: true,
});

// Persistente (no solo de sesión): una vez reclamada de verdad, no se vuelve
// a mostrar. Cerrar el modal sin reclamar NO se guarda aquí — a propósito,
// para que reaparezca en el próximo reload mientras siga sin reclamarse.
const claimedKey = (batchId: string) => `even-promo-claimed-${batchId}`;

// Módulo en memoria (no localStorage/sessionStorage): sobrevive la
// navegación cliente entre rutas, así no se re-muestra cada vez que este
// componente se re-monta, pero se resetea solo en un reload real del
// navegador (se reevalúa el módulo).
const shownThisPageLoad = new Set<string>();

export function usePromoActivation() {
  const { restaurantId, branchNumber } = useRestaurant();
  const { isAuthenticated } = useAuth();

  // Puede haber varias activaciones vigentes al mismo tiempo para la misma
  // sucursal — se muestran todas, cada una con su propio reclamo.
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
    try {
      // Promos de sucursal + descuentos personales (estos últimos solo con
      // sesión) en paralelo — los personales van primero en el carrusel.
      const [promosResponse, personalResponse] = await Promise.all([
        promoActivationsService.getActive(restaurantId, branchNumber),
        isAuthenticated
          ? userDiscountsService.getActive(restaurantId)
          : Promise.resolve({ success: true, data: [] as UserDiscount[] }),
      ]);

      // 'item' (descuento de producto) ya no se reclama en este
      // modal — se ve directo en el precio del producto
      // (usePersonalItemDiscounts) y se aplica solo al agregarlo al
      // carrito. FlexBill aún no soporta 'order', así que este arreglo
      // queda vacío en la práctica — se deja el filtro explícito por
      // claridad y para cuando 'order' se soporte aquí.
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
  // como "ya mostradas" solo en memoria — no persiste, así que reaparecen
  // en el próximo reload real si siguen sin reclamarse.
  const dismissAll = useCallback(() => {
    setActivations((current) => {
      current.forEach((a) => shownThisPageLoad.add(a.batch_id));
      return [];
    });
  }, []);

  // Se llama tras un reclamo exitoso de UN platillo del batch: el batch
  // completo deja de mostrarse para siempre (persiste en localStorage) —
  // el comensal ya usó su elección, sin importar cuál platillo tomó. Las
  // demás activaciones de la lista, si las hay, se quedan visibles.
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
    refresh,
    dismissAll,
    markClaimed,
  };
}
