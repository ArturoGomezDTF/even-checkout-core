"use client";

import MenuView from "@/components/menu/MenuView";
import Loader from "@/components/UI/Loader";
import PromoActivationBanner from "@/components/PromoActivationBanner";
import ValidationError from "@/components/ValidationError";
import { useRestaurant } from "@/context/RestaurantContext";
import { usePickAndGoContext } from "@/context/PickAndGoContext";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import { useEffect } from "react";

const MenuPage = () => {
  const { validationError, restaurantId } = useValidateAccess();
  const { setRestaurantId: setPickAndGoRestaurantId } = usePickAndGoContext();
  const { restaurant, error } = useRestaurant();

  useEffect(() => {
    if (restaurantId && !isNaN(restaurantId)) {
      setPickAndGoRestaurantId(restaurantId.toString());
    }
  }, [restaurantId, setPickAndGoRestaurantId]);

  useEffect(() => {
    if (restaurant?.name) {
      document.title = restaurant.name + " | Pick & Go";
      return () => {
        document.title = "Even Pick & Go";
      };
    }
  }, [restaurant?.name]);

  // Mostrar error de validación
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  // Mostrar error si falla la carga del restaurante
  if (error) {
    return <ValidationError errorType="VALIDATION_ERROR" />;
  }

  // Verificar que tenemos los datos necesarios
  if (!restaurant || !restaurantId) {
    return <Loader />;
  }

  return (
    <>
      <MenuView />
      <PromoActivationBanner />
    </>
  );
};

export default MenuPage;
