import { useEffect, useState } from "react";
import type { PromoActivationsService } from "../promoActivations";
import type { UseClaimedOrderDiscount } from "./types";

// Unifica las DOS fuentes posibles de "% en la cuenta" en el checkout:
// el descuento personal (user_discounts, TK-0078) y la promo QR de cuenta
// (promo_activations vía QR exclusivo). Prioridad: personal primero — si
// el cliente tiene ambos reclamados a la vez, solo se aplica uno (nunca se
// mandan los dos ids juntos a confirmOrder, el backend lo rechazaría).
export interface AccountDiscount {
  source: "personal" | "promo";
  id: string;
  discountPercentage: number;
}

export interface AccountDiscountDeps {
  promoActivationsService: Pick<
    PromoActivationsService,
    "getClaimedOrderDiscount"
  >;
  useClaimedOrderDiscount: UseClaimedOrderDiscount;
}

export function createUseAccountDiscount({
  promoActivationsService,
  useClaimedOrderDiscount,
}: AccountDiscountDeps) {
  return function useAccountDiscount(
    restaurantId: number | null,
    branchNumber: number | null,
  ): { accountDiscount: AccountDiscount | null; loading: boolean } {
    const { discount: personal, loading: personalLoading } =
      useClaimedOrderDiscount(restaurantId);
    const promoKey =
      restaurantId && branchNumber ? `${restaurantId}|${branchNumber}` : null;
    const [promo, setPromo] = useState<{
      key: string;
      discount: AccountDiscount | null;
    } | null>(null);

    useEffect(() => {
      if (!promoKey || !restaurantId || !branchNumber) return;
      let cancelled = false;
      promoActivationsService
        .getClaimedOrderDiscount(restaurantId, branchNumber)
        .then((response) => {
          if (cancelled) return;
          const claimed =
            response.success && response.data ? response.data : null;
          setPromo({
            key: promoKey,
            discount: claimed
              ? {
                  source: "promo",
                  id: claimed.redemptionId,
                  discountPercentage: claimed.discountPercentage,
                }
              : null,
          });
        })
        .catch(() => {
          if (!cancelled) setPromo({ key: promoKey, discount: null });
        });
      return () => {
        cancelled = true;
      };
    }, [promoKey, restaurantId, branchNumber]);

    if (personal) {
      return {
        accountDiscount: {
          source: "personal",
          id: personal.id,
          discountPercentage: personal.discount_percentage,
        },
        loading: false,
      };
    }

    const promoLoading = promoKey !== null && promo?.key !== promoKey;
    return {
      accountDiscount:
        promoKey !== null && promo?.key === promoKey ? promo.discount : null,
      loading: personalLoading || promoLoading,
    };
  };
}
