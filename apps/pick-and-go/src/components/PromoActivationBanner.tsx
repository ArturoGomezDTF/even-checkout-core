"use client";

import { usePromoActivation } from "@/hooks/usePromoActivation";
import { promoActivationsService } from "@/services/promoActivations.service";
import { userDiscountsService } from "@/services/userDiscounts.service";
import { useCart } from "@/context/CartContext";
import { useNavigation } from "@/hooks/useNavigation";
import PromoClaimModal from "./PromoClaimModal";

interface PromoActivationBannerProps {
  onRequireLogin?: () => void;
  onAuthComplete?: () => void;
}

export default function PromoActivationBanner({
  onRequireLogin,
  onAuthComplete,
}: PromoActivationBannerProps) {
  const {
    activations,
    isAuthenticated,
    dismissAll,
    markClaimed,
    restaurantId,
    branchNumber,
    promoCode,
  } = usePromoActivation();
  const { refreshCart } = useCart();
  const { navigateWithRestaurantId } = useNavigation();

  if (activations.length === 0) return null;

  const handleClaim = async (claimId: string) => {
    // Los descuentos personales van disfrazados de activación (ver
    // usePromoActivation): su claimId es el id del user_discount y el claim
    // va al endpoint de user-discounts. Una promo QR real tipo 'order' no
    // tiene items — su id de fila única viene en activation_id. Tipo
    // 'item' agrega el platillo al carrito (precio descontado server-side);
    // tipo 'order' (personal o promo real) solo queda armado y se aplica
    // al pagar.
    const owner = activations.find(
      (a) =>
        a.batch_id === `ud-${claimId}` ||
        a.activation_id === claimId ||
        a.items.some((item) => item.id === claimId),
    );

    const response = owner?.personal
      ? await userDiscountsService.claim(
          claimId,
          restaurantId,
          branchNumber,
          owner.personalType === "item",
        )
      : await promoActivationsService.claim(
          claimId,
          restaurantId,
          branchNumber,
          promoCode,
        );

    if (!response.success) {
      throw new Error(
        response.error?.message || response.message || "Error al reclamar",
      );
    }

    if (!owner || owner.items.length > 0) {
      await refreshCart();
    }
  };

  const handleRequireLogin = () => {
    if (onRequireLogin) {
      onRequireLogin();
      return;
    }
    navigateWithRestaurantId("/auth-selection");
  };

  return (
    <PromoClaimModal
      activations={activations}
      isAuthenticated={isAuthenticated}
      onDismiss={dismissAll}
      onClaim={handleClaim}
      onClaimed={markClaimed}
      onRequireLogin={handleRequireLogin}
      onAuthComplete={onAuthComplete}
    />
  );
}
