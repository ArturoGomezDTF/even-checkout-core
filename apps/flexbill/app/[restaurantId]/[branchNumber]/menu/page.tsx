"use client";

import { useTranslations } from "next-intl";
import MenuView, { MenuViewHandle } from "@/app/components/MenuView";
import PromoActivationBanner from "@/app/components/PromoActivationBanner";
import { useRestaurant } from "@/app/context/RestaurantContext";
import Loader from "@/app/components/UI/Loader";
import ValidationError from "@/app/components/ValidationError";
import ErrorScreen from "@/app/components/ErrorScreen";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import { useEffect, useRef } from "react";

export default function RestaurantMenuPage() {
  const t = useTranslations("MenuPage");
  const { validationError, tableNumber } = useValidateAccess();
  const { restaurant, loading, error } = useRestaurant();
  const menuViewRef = useRef<MenuViewHandle>(null);

  useEffect(() => {
    if (restaurant?.name) {
      document.title = restaurant.name + " | Flex Bill";
      return () => {
        document.title = "Even Flex Bill";
      };
    }
  }, [restaurant?.name]);

  // Mostrar error de validación
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  // Mostrar loader mientras valida o carga
  if (loading || !restaurant) {
    return <Loader />;
  }

  // Mostrar error si falla la carga
  if (error) {
    return (
      <ErrorScreen
        title={t("errorLoadingTitle")}
        description={t("errorLoadingDescription")}
        detail={error}
      />
    );
  }

  return (
    <>
      <MenuView ref={menuViewRef} tableNumber={tableNumber || ""} />
      <PromoActivationBanner
        onRequireLogin={() => menuViewRef.current?.openAuthModal()}
        onAuthComplete={() => menuViewRef.current?.closeAuthModal()}
      />
    </>
  );
}
