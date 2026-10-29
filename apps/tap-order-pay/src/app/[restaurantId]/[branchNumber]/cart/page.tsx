"use client";

import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";
import CartView from "@/components/CartView";
import PromoActivationBanner from "@/components/PromoActivationBanner";
import { useEffect } from "react";

export default function CartPage() {
  const { validationError } = useValidateAccess();

  useEffect(() => {
    document.title = "Mi Carrito | Tap Order & Pay";
    return () => {
      document.title = "Even Tap Order & Pay";
    };
  }, []);

  // Mostrar error de validación
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  // El banner también vive aquí (no solo en el menú): el flujo típico de
  // login ocurre al ordenar y regresa al carrito — si el usuario entró al
  // menú como invitado, sus descuentos personales aparecen hasta aquí.
  return (
    <>
      <CartView />
      <PromoActivationBanner />
    </>
  );
}
