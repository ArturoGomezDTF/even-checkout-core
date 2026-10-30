import { createUserDiscountsService } from "@even/cart";
import { requestWithAuth } from "./request-helper";

export {
  userDiscountDetailSuffix,
  type UserDiscount,
  type UserDiscountCustomField,
} from "@even/cart";

// Servicio con el que este frontend se identifica ante el backend de
// descuentos personales (columna user_discounts.service).
export const USER_DISCOUNT_SERVICE = "room-service";

export const userDiscountsService = createUserDiscountsService(
  requestWithAuth,
  USER_DISCOUNT_SERVICE,
);
