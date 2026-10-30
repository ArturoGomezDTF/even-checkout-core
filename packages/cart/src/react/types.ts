import type { UserDiscount } from "../userDiscounts";

/** Lo mínimo que estos hooks necesitan del AuthContext de cada app. */
export type UseAuth = () => {
  isAuthenticated: boolean;
  isLoading: boolean;
  user?: { id?: string | number | null } | null;
};

export type UseClaimedOrderDiscount = (restaurantId: number | null) => {
  discount: UserDiscount | null;
  loading: boolean;
};
