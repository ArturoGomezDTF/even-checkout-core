"use client";

import MenuView from "@/components/menu/MenuView";
import Loader from "@/components/UI/Loader";
import PromoActivationBanner from "@/components/PromoActivationBanner";
import { useRestaurant } from "@/context/RestaurantContext";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";
import React, { useEffect } from "react";

const MenuPage = () => {
  const { validationError, tableNumber } = useValidateAccess();
  const { restaurant, loading, error } = useRestaurant();

  useEffect(() => {
    if (restaurant?.name) {
      document.title = restaurant.name + " | Tap Order & Pay";
      return () => {
        document.title = "Even Tap Order & Pay";
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
  if (!restaurant || !tableNumber) {
    return <Loader />;
  }

  return (
    <>
      <MenuView tableNumber={tableNumber} />
      <PromoActivationBanner />
    </>
  );
};

export default MenuPage;
