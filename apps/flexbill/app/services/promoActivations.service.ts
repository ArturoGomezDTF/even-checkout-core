import { createPromoActivationsService } from "@even/cart";
import { requestWithAuth } from "./request-helper";

export {
  promoItemDetailSuffix,
  type ActivationMenuItem,
  type ClaimedOrderPromo,
  type PromoActivation,
  type PromoActivationItem,
} from "@even/cart";

export const promoActivationsService =
  createPromoActivationsService(requestWithAuth);
