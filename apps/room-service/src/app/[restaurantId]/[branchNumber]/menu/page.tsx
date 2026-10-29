"use client";

import MenuView from "@/components/menu/MenuView";
import Loader from "@/components/UI/Loader";
import PromoActivationBanner from "@/components/PromoActivationBanner";
import { useRestaurant } from "@/context/RestaurantContext";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";
import { useEffect } from "react";

const MenuPage = () => {
  const { validationError, roomNumber } = useValidateAccess();
  const { restaurant, loading, error } = useRestaurant();

  useEffect(() => {
    if (restaurant?.name) {
      document.title = restaurant.name + " | Room Service";
      return () => {
        document.title = "Even Room Service";
      };
    }
  }, [restaurant?.name]);

  // Mostrar loader mientras carga
  if (loading) {
    return <Loader />;
  }

  // Mostrar error de validación
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  // Mostrar error si falla la carga del restaurante
  if (error) {
    return <ValidationError errorType="VALIDATION_ERROR" />;
  }

  // Verificar que tenemos los datos necesarios
  if (!restaurant || !roomNumber) {
    return <Loader />;
  }

  return (
    <>
      <MenuView roomNumber={roomNumber} />
      <PromoActivationBanner />
    </>
  );
};

export default MenuPage;
