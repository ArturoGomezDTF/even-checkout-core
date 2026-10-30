import { createUsePersonalItemDiscounts } from "@even/cart/react";
import { userDiscountsService } from "@/services/userDiscounts.service";
import { useAuth } from "@/context/AuthContext";

export type { PersonalItemDiscount } from "@even/cart/react";

export const usePersonalItemDiscounts = createUsePersonalItemDiscounts({
  userDiscountsService,
  useAuth,
});
