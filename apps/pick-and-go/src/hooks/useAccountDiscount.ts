import { createUseAccountDiscount } from "@even/cart/react";
import { promoActivationsService } from "@/services/promoActivations.service";
import { useClaimedOrderDiscount } from "./useClaimedOrderDiscount";

export type { AccountDiscount } from "@even/cart/react";

export const useAccountDiscount = createUseAccountDiscount({
  promoActivationsService,
  useClaimedOrderDiscount,
});
