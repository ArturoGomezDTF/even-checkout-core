"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePickAndGoContext } from "@/context/PickAndGoContext";
import { useRestaurant } from "@/context/RestaurantContext";
import CartView from "@/components/CartView";
import PromoActivationBanner from "@/components/PromoActivationBanner";

export default function CartPage() {
  const t = useTranslations("CartPage");
  const tc = useTranslations("Common");
  const params = useParams();
  const router = useRouter();
  const { setRestaurantId: setPickAndGoRestaurantId } = usePickAndGoContext();
  const { setRestaurantId } = useRestaurant();
  const restaurantId = params?.restaurantId as string;

  useEffect(() => {
    document.title = t("pageTitle");
    return () => {
      document.title = "Even Pick & Go";
    };
  }, [t]);

  useEffect(() => {
    if (!restaurantId || isNaN(parseInt(restaurantId))) {
      router.push("/");
      return;
    }

    // Establecer restaurant ID en ambos contextos
    setRestaurantId(parseInt(restaurantId));
    setPickAndGoRestaurantId(restaurantId);
  }, [restaurantId, setRestaurantId, setPickAndGoRestaurantId, router]);

  if (!restaurantId || isNaN(parseInt(restaurantId))) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            {tc("invalidRestaurantTitle")}
          </h1>
          <p className="text-gray-600">{tc("invalidRestaurantMessage")}</p>
        </div>
      </div>
    );
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
