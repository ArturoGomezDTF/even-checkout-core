import { useEffect, useState } from "react";
import {
  userDiscountsService,
  type UserDiscount,
} from "@/services/userDiscounts.service";
import { useAuth } from "@/context/AuthContext";

// Descuento de producto asignado desde main-portal a este
// usuario: a diferencia de "% en la cuenta", este ya no se reclama en un
// modal — se ve directo en el precio del producto y se aplica solo al
// agregarlo al carrito (ver usePromoActivation, que ya sólo muestra 'order').
export interface PersonalItemDiscount {
  id: string;
  percentage: number;
}

type DiscountMap = Map<number, PersonalItemDiscount>;

// Cache a nivel de módulo: el menú monta un item por platillo, y todos
// comparten una sola petición por restaurante+usuario en vez de una por
// fila. La llave incluye el userId (no solo restaurantId) para que cambiar
// de cuenta sin recargar la página nunca reutilice el mapa del usuario
// anterior — si solo estuviera por restaurantId, al iniciar sesión con otro
// usuario en la misma pantalla se seguiría sirviendo (instantáneamente, sin
// red) la promesa ya resuelta del usuario previo.
const cache = new Map<string, Promise<DiscountMap>>();

function buildMap(discounts: UserDiscount[]): DiscountMap {
  const map: DiscountMap = new Map();
  for (const d of discounts) {
    // 'claimed' también es elegible: un descuento reusable (usage_limit > 1
    // o null) pasa de 'assigned' a 'claimed' tras su primer uso (ver
    // mark_user_discount_used) y debe seguir viéndose en el menú para los
    // usos siguientes — solo 'used' (agotado) y 'revoked' quedan fuera.
    if (
      d.discount_type !== "item" ||
      (d.status !== "assigned" && d.status !== "claimed") ||
      d.menu_item_id == null
    ) {
      continue;
    }
    const existing = map.get(d.menu_item_id);
    // No debería haber más de un descuento personal vivo para el mismo
    // producto, pero si lo hay, se queda con el de mayor %.
    if (!existing || d.discount_percentage > existing.percentage) {
      map.set(d.menu_item_id, { id: d.id, percentage: d.discount_percentage });
    }
  }
  return map;
}

async function fetchMap(restaurantId: number): Promise<DiscountMap> {
  const response = await userDiscountsService.getActive(restaurantId);
  return buildMap(response.success && response.data ? response.data : []);
}

export function usePersonalItemDiscounts(
  restaurantId: number | null,
): DiscountMap {
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id ?? null;
  const [map, setMap] = useState<DiscountMap>(new Map());

  useEffect(() => {
    if (!restaurantId || !isAuthenticated || !userId) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    const key = `${restaurantId}:${userId}`;
    let promise = cache.get(key);
    if (!promise) {
      promise = fetchMap(restaurantId);
      cache.set(key, promise);
      // No cachear un fallo: la próxima instancia debe poder reintentar.
      promise.catch(() => cache.delete(key));
    }
    promise.then((result) => {
      if (!cancelled) setMap(result);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, isAuthenticated, userId]);

  return map;
}
