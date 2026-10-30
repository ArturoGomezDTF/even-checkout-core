import { createUseClaimedOrderDiscount } from "@even/cart/react";
import { userDiscountsService } from "@/services/userDiscounts.service";
import { useAuth } from "@/context/AuthContext";

export const useClaimedOrderDiscount = createUseClaimedOrderDiscount({
  userDiscountsService,
  useAuth,
});
