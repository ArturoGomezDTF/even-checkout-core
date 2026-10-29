import { useEffect, useState } from "react";
import {
  userDiscountsService,
  type UserDiscount,
} from "@/services/userDiscounts.service";
import { useAuth } from "@/context/AuthContext";

// Descuento personal "% en la cuenta" ya reclamado por este usuario para
// este restaurante (TK-0078). El checkout lo usa para descontar el base
// ANTES de calcular comisiones/total, y manda su id en processPayment —
// el backend valida y consume el único uso al cobrar (y lo revierte si el
// cobro no se concreta).
export function useClaimedOrderDiscount(restaurantId: number | null) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const key = restaurantId && isAuthenticated ? String(restaurantId) : null;
  const [resolved, setResolved] = useState<{
    key: string;
    discount: UserDiscount | null;
  } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    userDiscountsService
      .getActive(Number(key))
      .then((response) => {
        if (cancelled) return;
        const claimed = (response.success && response.data
          ? response.data
          : []
        ).find((d) => d.discount_type === "order" && d.status === "claimed");
        setResolved({ key, discount: claimed ?? null });
      })
      .catch(() => {
        if (!cancelled) setResolved({ key, discount: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Derivado en el render (no en un efecto) para que nunca haya un frame
  // con loading=false y el descuento todavía sin pedir.
  const loading = authLoading || (key !== null && resolved?.key !== key);
  const discount = key !== null && resolved?.key === key ? resolved.discount : null;

  return { discount, loading };
}
