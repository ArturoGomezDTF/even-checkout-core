"use client";

import { useTranslations } from "next-intl";
import { usePromoActivation } from "../hooks/usePromoActivation";
import { promoActivationsService } from "../services/promoActivations.service";
import { userDiscountsService } from "../services/userDiscounts.service";
import { useCart } from "../context/CartContext";
import { useTableNavigation } from "../hooks/useTableNavigation";
import PromoClaimModal from "./PromoClaimModal";

interface PromoActivationBannerProps {
  onRequireLogin?: () => void;
  onAuthComplete?: () => void;
}

export default function PromoActivationBanner({
  onRequireLogin,
  onAuthComplete,
}: PromoActivationBannerProps) {
  const t = useTranslations("PromoActivationBanner");
  const {
    activations,
    isAuthenticated,
    dismissAll,
    markClaimed,
    restaurantId,
    branchNumber,
  } = usePromoActivation();
  const { refreshCart } = useCart();
  const { navigateWithTable } = useTableNavigation();

  if (activations.length === 0) return null;

  const handleClaim = async (activationId: string) => {
    // Los descuentos personales van disfrazados de activación (ver
    // usePromoActivation): su items[].id es el id del user_discount y el
    // claim va al endpoint de user-discounts, que también lo agrega al
    // carrito con el precio descontado.
    const owner = activations.find((a) =>
      a.items.some((item) => item.id === activationId),
    );
    const response = owner?.personal
      ? await userDiscountsService.claim(
          activationId,
          restaurantId,
          branchNumber,
        )
      : await promoActivationsService.claim(
          activationId,
          restaurantId,
          branchNumber,
        );
    if (!response.success) {
      const err = response.error;
      throw new Error(
        (typeof err === "string" ? err : err?.message) ||
          response.message ||
          t("errorClaimGeneric"),
      );
    }
    await refreshCart();
  };

  // No se marca como "reclamado" — al volver del login (mismo modal de
  // Settings/AuthView, o misma sesión de navegador si se navegó afuera),
  // usePromoActivation vuelve a mostrar el modal, ahora ya autenticado,
  // listo para reclamar de verdad.
  const handleRequireLogin = () => {
    if (onRequireLogin) {
      onRequireLogin();
      return;
    }
    navigateWithTable("/auth-selection");
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
